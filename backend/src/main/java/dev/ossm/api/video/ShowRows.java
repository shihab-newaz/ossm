package dev.ossm.api.video;

import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.jdbc.core.simple.JdbcClient;

/** Shows by name: one row per name, ignoring case and spacing (as artists are). */
public final class ShowRows {

  private static final Pattern WHITESPACE = Pattern.compile("\\s+");

  private ShowRows() {}

  public static String key(String name) {
    return WHITESPACE.matcher(name.strip()).replaceAll(" ").toLowerCase(Locale.ROOT);
  }

  /** The show with this name, created if there is none. */
  public static UUID upsert(JdbcClient jdbc, String name) {
    return jdbc.sql(
            "insert into video_show (id, name, name_key) values (:id, :name, :key)"
                + " on conflict (name_key) do update set name = video_show.name returning id")
        .param("id", UUID.randomUUID())
        .param("name", name.strip())
        .param("key", key(name))
        .query(UUID.class)
        .single();
  }

  /** Shows left with no episodes (after an episode was moved or turned into a movie) go away. */
  static void deleteEmpty(JdbcClient jdbc) {
    jdbc.sql(
            "delete from video_show s where not exists (select 1 from video v where v.show_id = s.id)")
        .update();
  }
}
