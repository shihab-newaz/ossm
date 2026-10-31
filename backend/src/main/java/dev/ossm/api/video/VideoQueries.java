package dev.ossm.api.video;

import dev.ossm.api.video.VideoDtos.Season;
import dev.ossm.api.video.VideoDtos.Show;
import dev.ossm.api.video.VideoDtos.ShowDetail;
import dev.ossm.api.video.VideoDtos.Subtitle;
import dev.ossm.api.video.VideoDtos.Video;
import dev.ossm.api.video.VideoDtos.VideoKind;
import dev.ossm.api.video.VideoDtos.WatchProgress;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/** Reads of the video library, always with the reader's own watch progress. */
@Component
class VideoQueries {

  private static final String VIDEO_SELECT =
      "select v.id, v.kind, v.title, v.year, v.description, v.show_id, s.name as show_name,"
          + " v.season, v.episode, v.duration_ms, v.width, v.height, v.video_codec, v.audio_codec,"
          + " v.container, v.bitrate_kbps, v.playable, v.thumbnail_key, v.license,"
          + " u.username as uploaded_by, v.uploader_id, v.created_at, wp.position_ms,"
          + " wp.duration_ms as wp_duration_ms, wp.watched, wp.updated_at as wp_updated_at"
          + " from video v join users u on u.id = v.uploader_id"
          + " left join video_show s on s.id = v.show_id"
          + " left join watch_progress wp on wp.video_id = v.id and wp.user_id = :me";

  static final String EPISODE_ORDER =
      " order by v.season nulls last, v.episode nulls last, lower(v.title), v.id";

  private final JdbcClient jdbc;

  VideoQueries(JdbcClient jdbc) {
    this.jdbc = jdbc;
  }

  static String sortClause(String sort) {
    return switch (sort == null ? "added" : sort) {
      case "title" -> " order by lower(v.title), v.id";
      case "year" -> " order by v.year desc nulls last, lower(v.title), v.id";
      default -> " order by v.created_at desc, v.id";
    };
  }

  List<Video> list(UUID me, VideoKind kind, String sort, String paging) {
    return jdbc.sql(VIDEO_SELECT + " where v.kind = :kind" + sortClause(sort) + paging)
        .param("me", me)
        .param("kind", kind.name())
        .query(VideoQueries::video)
        .list();
  }

  long count(VideoKind kind) {
    return jdbc.sql("select count(*) from video where kind = :kind")
        .param("kind", kind.name())
        .query(Long.class)
        .single();
  }

  List<Video> recent(UUID me, int limit) {
    return jdbc.sql(VIDEO_SELECT + " order by v.created_at desc, v.id limit :limit")
        .param("me", me)
        .param("limit", limit)
        .query(VideoQueries::video)
        .list();
  }

  /** In progress, newest first, and a show once: as the episode watched last. */
  List<Video> continueWatching(UUID me, int limit) {
    return jdbc.sql(
            "select * from (select distinct on (coalesce(x.show_id, x.id)) x.* from ("
                + VIDEO_SELECT
                + " where wp.user_id = :me and not wp.watched and wp.position_ms > 0) x"
                + " order by coalesce(x.show_id, x.id), x.wp_updated_at desc) latest"
                + " order by wp_updated_at desc limit :limit")
        .param("me", me)
        .param("limit", limit)
        .query(VideoQueries::video)
        .list();
  }

  Optional<Video> find(UUID me, UUID id) {
    return jdbc.sql(VIDEO_SELECT + " where v.id = :id")
        .param("me", me)
        .param("id", id)
        .query(VideoQueries::video)
        .optional();
  }

  Optional<UUID> uploader(UUID id) {
    return jdbc.sql("select uploader_id from video where id = :id")
        .param("id", id)
        .query(UUID.class)
        .optional();
  }

  /** For an episode, what comes after it in its show; for a movie, other movies, newest first. */
  List<Video> upNext(UUID me, Video video) {
    if (video.kind() == VideoKind.EPISODE) {
      var episodes = episodes(me, video.showId());
      int at = -1;
      for (int i = 0; i < episodes.size(); i++) {
        if (episodes.get(i).id().equals(video.id())) {
          at = i;
        }
      }
      return episodes.subList(at + 1, Math.min(episodes.size(), at + 11));
    }
    return jdbc.sql(
            VIDEO_SELECT
                + " where v.kind = 'MOVIE' and v.id <> :id order by v.created_at desc, v.id limit 12")
        .param("me", me)
        .param("id", video.id())
        .query(VideoQueries::video)
        .list();
  }

  List<Video> episodes(UUID me, UUID showId) {
    return jdbc.sql(VIDEO_SELECT + " where v.show_id = :show" + EPISODE_ORDER)
        .param("me", me)
        .param("show", showId)
        .query(VideoQueries::video)
        .list();
  }

  List<Subtitle> subtitles(UUID videoId) {
    return jdbc.sql("select idx, language, label from subtitle where video_id = :id order by idx")
        .param("id", videoId)
        .query(
            (rs, i) ->
                new Subtitle(
                    rs.getInt("idx"),
                    rs.getString("language"),
                    rs.getString("label"),
                    "/api/v1/videos/%s/subtitles/%d".formatted(videoId, rs.getInt("idx"))))
        .list();
  }

  private static final String SHOW_SELECT =
      "with stats as (select s.id, s.name, count(distinct coalesce(v.season, 0)) as season_count,"
          + " count(v.id) as episode_count, max(v.created_at) as last_added,"
          + " max(v.year) as max_year from video_show s join video v on v.show_id = s.id"
          + " group by s.id)"
          + " select st.*, th.id as thumb_video, p.position_ms, p.duration_ms as wp_duration_ms,"
          + " p.watched, p.updated_at as wp_updated_at from stats st"
          + " left join lateral (select v.id from video v where v.show_id = st.id"
          + " and v.thumbnail_key is not null"
          + " order by v.season desc nulls last, v.episode desc nulls last limit 1) th on true"
          + " left join lateral (select wp.* from watch_progress wp join video e"
          + " on e.id = wp.video_id where e.show_id = st.id and wp.user_id = :me"
          + " and not wp.watched and wp.position_ms > 0 order by wp.updated_at desc limit 1) p"
          + " on true";

  List<Show> shows(UUID me, String sort, String paging) {
    var order =
        switch (sort == null ? "added" : sort) {
          case "title" -> " order by lower(st.name), st.id";
          case "year" -> " order by st.max_year desc nulls last, lower(st.name), st.id";
          default -> " order by st.last_added desc, st.id";
        };
    return jdbc.sql(SHOW_SELECT + order + paging).param("me", me).query(VideoQueries::show).list();
  }

  long showCount() {
    return jdbc.sql(
            "select count(*) from video_show s where exists"
                + " (select 1 from video v where v.show_id = s.id)")
        .query(Long.class)
        .single();
  }

  Optional<ShowDetail> showDetail(UUID me, UUID id) {
    var show =
        jdbc.sql(SHOW_SELECT + " where st.id = :id")
            .param("me", me)
            .param("id", id)
            .query(VideoQueries::show)
            .optional();
    if (show.isEmpty()) {
      return Optional.empty();
    }
    var episodes = episodes(me, id);
    var bySeason = new LinkedHashMap<Integer, List<Video>>();
    for (var e : episodes) {
      bySeason.computeIfAbsent(e.season() == null ? 0 : e.season(), k -> new ArrayList<>()).add(e);
    }
    var seasons =
        bySeason.entrySet().stream().map(s -> new Season(s.getKey(), s.getValue())).toList();
    return Optional.of(
        new ShowDetail(show.get(), episodes.get(0).uploadedBy(), seasons, resume(episodes)));
  }

  /** The episode in progress watched most recently, else the one after the last watched. */
  private static Video resume(List<Video> episodes) {
    Video latest = null;
    for (var e : episodes) {
      var p = e.progress();
      if (p != null && !p.watched() && p.positionMs() > 0) {
        if (latest == null || p.updatedAt().isAfter(latest.progress().updatedAt())) {
          latest = e;
        }
      }
    }
    if (latest != null) {
      return latest;
    }
    int lastWatched = -1;
    for (int i = 0; i < episodes.size(); i++) {
      if (episodes.get(i).progress() != null && episodes.get(i).progress().watched()) {
        lastWatched = i;
      }
    }
    return lastWatched >= 0 && lastWatched + 1 < episodes.size()
        ? episodes.get(lastWatched + 1)
        : null;
  }

  private static WatchProgress progress(ResultSet rs) throws SQLException {
    var position = rs.getObject("position_ms");
    if (position == null) {
      return null;
    }
    return new WatchProgress(
        ((Number) position).longValue(),
        rs.getLong("wp_duration_ms"),
        rs.getBoolean("watched"),
        rs.getObject("wp_updated_at", OffsetDateTime.class).toInstant());
  }

  static Video video(ResultSet rs, int row) throws SQLException {
    var id = rs.getObject("id", UUID.class);
    return new Video(
        id,
        VideoKind.valueOf(rs.getString("kind")),
        rs.getString("title"),
        (Integer) rs.getObject("year"),
        rs.getString("description"),
        rs.getObject("show_id", UUID.class),
        rs.getString("show_name"),
        (Integer) rs.getObject("season"),
        (Integer) rs.getObject("episode"),
        rs.getLong("duration_ms"),
        (Integer) rs.getObject("width"),
        (Integer) rs.getObject("height"),
        rs.getString("video_codec"),
        rs.getString("audio_codec"),
        rs.getString("container"),
        (Integer) rs.getObject("bitrate_kbps"),
        rs.getBoolean("playable"),
        rs.getString("thumbnail_key") == null ? null : "/api/v1/videos/" + id + "/thumbnail",
        rs.getString("license"),
        rs.getString("uploaded_by"),
        rs.getObject("created_at", OffsetDateTime.class).toInstant(),
        progress(rs));
  }

  private static Show show(ResultSet rs, int row) throws SQLException {
    var thumb = rs.getObject("thumb_video", UUID.class);
    return new Show(
        rs.getObject("id", UUID.class),
        rs.getString("name"),
        rs.getInt("season_count"),
        rs.getInt("episode_count"),
        thumb == null ? null : "/api/v1/videos/" + thumb + "/thumbnail",
        progress(rs));
  }
}
