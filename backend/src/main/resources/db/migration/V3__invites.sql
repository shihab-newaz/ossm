-- An invited person exists as a pending user with no password until they accept.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- Only a SHA-256 of the token is stored, so a database leak does not leak working links.
CREATE TABLE invites (
    id         uuid PRIMARY KEY,
    user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash text        NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX invites_user_id_ix ON invites (user_id);
