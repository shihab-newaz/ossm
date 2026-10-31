# 3. Auth and sessions

Tickets 03 and 04. ADR 0004. Migrations V2 and V3.

## Goal

A fresh instance can be claimed by its first user, who becomes admin. After that nobody can register. The admin brings people in by invite, can deactivate them, and everyone can change their own password. Sessions survive an API restart.

## Learn first

- How a Spring Security filter chain decides what a request may do, and how `SecurityContext` is stored between requests.
- Server-side sessions (a cookie holds an id; the state is in a store) versus tokens. Spring Session JDBC keeps sessions in Postgres.
- Cookie attributes: `HttpOnly`, `SameSite`, `Secure`, `Max-Age`.
- Password hashing: why argon2id, what the cost parameters mean, and why you never encrypt passwords.
- Session fixation, and timing side channels in login.
- A Postgres advisory lock, and when you need one instead of a unique index.

## Procedure

1. **Schema.** `V2__users_and_sessions.sql`: a `users` table with a role check, a lower-case username constraint and a unique username, plus the Spring Session tables copied into a Flyway migration. Set `spring.session.jdbc.initialize-schema: never` so Flyway owns the schema.
2. **Password encoder.** `Argon2PasswordEncoder(16, 32, 1, 19_456, 2)`: the OWASP minimum cost of 19 MiB, 2 iterations, 1 lane. It needs BouncyCastle on the classpath.
3. **Security chain.** Switch off form login, HTTP basic, CSRF and the request cache. Declare an explicit allow-list (`health`, `api-docs`, `setup`, `login`, `logout`, invite accept) and make everything else require authentication. Admin routes require `ROLE_ADMIN`. Return problem-details JSON for 401 and 403.
4. **Own login controller.** Verify the password yourself, then start a session. Declare a dummy `UserDetailsService` so Boot does not generate a throwaway user and log its password.
5. **First-run setup.** `createAdminIfNoUsers` takes a transaction-scoped advisory lock first, so two simultaneous requests cannot both create an admin. It returns empty if any user exists.
6. **Session start.** If a session id was presented before login, change it (`changeSessionId`). The principal stored is only the username.
7. **Read the account fresh.** Role and active flag come from the database on each `/auth/me`, so deactivating a user takes effect without finding their sessions.
8. **Invites (V3).** `password_hash` becomes nullable: a pending user has no password. An invite stores only the SHA-256 of its token, with an expiry (7 days). Accepting sets the password and the token is spent.
9. **Admin endpoints and password change.** Changing your password needs the current one and invalidates your other sessions.

## Decisions and why (ADR 0004)

| Decision | Reason |
|---|---|
| Sessions in Postgres, not memory | They survive a restart, and logout deletes the row so a stolen cookie dies at once. |
| Cookie `OSSM_SESSION`, HttpOnly, SameSite=Lax, 30 days | The UI never sees a token. One origin, so Lax is enough. |
| CSRF protection off | JSON-only API, Lax cookie, single origin. Revisit if the API ever accepts form posts or cookies become `SameSite=None`. |
| Same 401 body for wrong user and wrong password, and a decoy hash check for unknown users | The response and the timing do not reveal which usernames exist. |
| Request cache off | Its default creates a session for every anonymous 401, which would let unauthenticated traffic write rows. |
| Principal is only the username | The current role and active flag are read from the database, so changes apply at once. |
| Invites instead of "create user with a password" | The admin never knows anyone's password. |

## Pitfalls

- Boot's auto-generated user and its logged password appear if you forget the dummy `UserDetailsService`.
- Without `changeSessionId` an attacker who planted a session id before login keeps it afterwards.
- A unique index alone does not stop two "first admin" requests; both can pass the "no users yet" check. That is what the lock is for.
- Not done, and recorded: no login throttling. Brute-force limits are a follow-up before exposing the instance to the internet.

## Snippets

**The filter chain** (`auth/SecurityConfig.java`, trimmed). Everything off that is not used, an explicit allow-list, then `anyRequest().authenticated()`.

```java
@Bean
PasswordEncoder passwordEncoder() {
  return new Argon2PasswordEncoder(16, 32, 1, 19_456, 2);   // OWASP minimum: 19 MiB, 2 iterations, 1 lane
}

@Bean
UserDetailsService noUserDetailsService() {                 // stops Boot generating a throwaway user
  return username -> {
    throw new UsernameNotFoundException("not used");
  };
}

@Bean
SecurityFilterChain securityFilterChain(
    HttpSecurity http, SecurityContextRepository contextRepository, ProblemWriter problems)
    throws Exception {
  return http
      .csrf(AbstractHttpConfigurer::disable)       // JSON only, SameSite=Lax, one origin: ADR 0004
      .httpBasic(AbstractHttpConfigurer::disable)
      .formLogin(AbstractHttpConfigurer::disable)
      .logout(AbstractHttpConfigurer::disable)
      .requestCache(AbstractHttpConfigurer::disable) // the default makes a session per anonymous 401
      .securityContext(context -> context.securityContextRepository(contextRepository))
      .authorizeHttpRequests(
          requests ->
              requests
                  .requestMatchers("/api/v1/health", "/v3/api-docs", "/v3/api-docs/**",
                      "/actuator/health/**").permitAll()
                  .requestMatchers(HttpMethod.GET, "/api/v1/setup").permitAll()
                  .requestMatchers(HttpMethod.POST, "/api/v1/setup", "/api/v1/auth/login",
                      "/api/v1/auth/logout").permitAll()
                  .requestMatchers(HttpMethod.GET, "/api/v1/invites/*").permitAll()
                  .requestMatchers(HttpMethod.POST, "/api/v1/invites/*/accept").permitAll()
                  .requestMatchers("/api/v1/users", "/api/v1/users/**", "/api/v1/admin/**")
                  .hasRole("ADMIN")
                  .anyRequest().authenticated())
      .exceptionHandling(
          exceptions ->
              exceptions
                  .authenticationEntryPoint(problems::unauthorized)
                  .accessDeniedHandler(problems::forbidden))
      .build();
}
```

**Starting a session** (`auth/SessionStarter.java`). Change the id if one was presented before login, and store only the username.

```java
void start(UserAccount account, HttpServletRequest request, HttpServletResponse response) {
  // A session id presented before login must not survive it (session fixation).
  if (request.getSession(false) != null) {
    request.changeSessionId();
  }
  // The principal is just the username: it serialises into the session row and the current
  // account (role, active flag) is always read fresh from the database.
  var authentication =
      UsernamePasswordAuthenticationToken.authenticated(
          account.getUsername(),
          null,
          List.of(new SimpleGrantedAuthority("ROLE_" + account.getRole().name())));
  var context = holder.createEmptyContext();
  context.setAuthentication(authentication);
  holder.setContext(context);
  repository.saveContext(context, request, response);
}
```

**Login** (`auth/AuthController.java`). One message for both failures.

```java
@PostMapping("/auth/login")
User login(@Valid @RequestBody LoginRequest body, HttpServletRequest request,
    HttpServletResponse response) {
  var account =
      accounts
          .authenticate(body.username(), body.password())
          .orElseThrow(
              () ->
                  new ResponseStatusException(
                      HttpStatus.UNAUTHORIZED, "Incorrect username or password."));
  sessions.start(account, request, response);
  return User.of(account);
}
```

**First-run setup and the decoy check** (`users/Accounts.java`, trimmed). The advisory lock serialises two simultaneous setup requests. The decoy hash makes an unknown username cost as much as a wrong password.

```java
private static final String SETUP_LOCK =
    "select count(*) from (select pg_advisory_xact_lock(4101)) as lock";

@Transactional
public Optional<UserAccount> createAdminIfNoUsers(String username, String password) {
  entityManager.createNativeQuery(SETUP_LOCK).getSingleResult();
  if (users.count() > 0) {
    return Optional.empty();
  }
  return Optional.of(
      users.save(new UserAccount(normalize(username), encoder.encode(password), Role.ADMIN)));
}

@Transactional(readOnly = true)
public Optional<UserAccount> authenticate(String username, String password) {
  var found = users.findByUsername(normalize(username)).filter(UserAccount::canLogIn);
  var matches =
      encoder.matches(password, found.map(UserAccount::getPasswordHash).orElse(decoyHash));
  return found.filter(account -> matches);
}
```

**Invites** (`users/Invites.java` and `V3__invites.sql`). The token is random and shown once; only its hash is stored. `delete ... returning` spends it atomically, so two concurrent accepts cannot both win.

```java
Issued issue(UUID userId) {
  jdbc.sql("delete from invites where user_id = :user").param("user", userId).update();
  var bytes = new byte[32];
  random.nextBytes(bytes);
  var token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
  var expiresAt = Instant.now().plus(LIFETIME);          // 7 days
  jdbc.sql("insert into invites (id, user_id, token_hash, expires_at)"
          + " values (:id, :user, :hash, :expires)")
      .param("id", UUID.randomUUID()).param("user", userId)
      .param("hash", hash(token)).param("expires", java.sql.Timestamp.from(expiresAt))
      .update();
  return new Issued(token, expiresAt);
}

Optional<UUID> consume(String token) {
  return jdbc.sql("delete from invites where token_hash = :hash and expires_at > now()"
          + " returning user_id")
      .param("hash", hash(token))
      .query(UUID.class)
      .optional();
}
```

```sql
-- V3: an invited person exists as a pending user with no password until they accept.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

CREATE TABLE invites (
    id         uuid PRIMARY KEY,
    user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash text        NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
```

**Two tests worth copying the style of** (`AuthFlowTest`). They assert on the HTTP response and, where the response cannot show it, on the table.

```java
@Test
void setupIsUnavailableOnceAnyUserExists() throws Exception {
  new Session(port).post("/api/v1/setup", ADMIN_SETUP);

  var stranger = new Session(port);
  var again = stranger.post("/api/v1/setup",
      "{\"username\":\"intruder\",\"password\":\"another long password\"}");

  assertThat(again.statusCode()).isEqualTo(409);
  assertThat(again.headers().firstValue("Content-Type").orElse(""))
      .startsWith("application/problem+json");
  assertThat(stranger.get("/api/v1/auth/me").statusCode()).isEqualTo(401);
  assertThat(jdbc.queryForObject("select count(*) from users", Integer.class)).isEqualTo(1);
}

@Test
void passwordsAreStoredAsArgon2idHashes() throws Exception {
  new Session(port).post("/api/v1/setup", ADMIN_SETUP);

  var stored = jdbc.queryForObject("select password_hash from users", String.class);

  assertThat(stored).startsWith("$argon2id$").doesNotContain("correct horse battery");
}
```

## Checkpoint

Write these as HTTP-level tests first:

- [ ] With no users, setup creates an admin and logs them in. Once any user exists, setup is refused.
- [ ] The stored password is an argon2id hash, not the password.
- [ ] A wrong username and a wrong password give identical responses.
- [ ] The session cookie is HttpOnly and long-lived.
- [ ] Logout makes the old cookie stop working.
- [ ] A session survives an API restart (stop the app context, start another against the same database).
- [ ] An invite link works once, and not after use or expiry.
- [ ] A deactivated user's next request with an existing session is rejected.
- [ ] A non-admin gets 403 from admin routes; an anonymous caller gets 401.
- [ ] Changing a password requires the current one and ends the user's other sessions.

## Reference code

`backend/src/main/java/dev/ossm/api/auth/` (`SecurityConfig`, `SessionStarter`, `AuthController`, `InvitesController`, `UsersController`, `ProblemWriter`), `users/` (`Accounts`, `Invites`, `UserAccount`), `V2__users_and_sessions.sql`, `V3__invites.sql`. Tests: `AuthFlowTest`, `UserManagementTest`, `SessionSurvivesRestartTest`.
