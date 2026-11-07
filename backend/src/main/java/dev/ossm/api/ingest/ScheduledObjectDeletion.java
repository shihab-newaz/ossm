package dev.ossm.api.ingest;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * The Postgres adapter: a row in db-scheduler's own table, named by the prefix, so asking twice is
 * one job. Written with the caller's connection rather than through the scheduler, which is what
 * lets it join the caller's transaction. {@link DbSchedulerIngestQueue} runs the jobs.
 */
@Component
class ScheduledObjectDeletion implements ObjectDeletionQueue {

  static final String TASK_NAME = "delete-prefix";

  private final JdbcClient jdbc;

  ScheduledObjectDeletion(JdbcClient jdbc) {
    this.jdbc = jdbc;
  }

  @Override
  public void deletePrefix(String prefix) {
    jdbc.sql(
            "insert into scheduled_tasks (task_name, task_instance, execution_time, picked, version)"
                + " values (:task, :prefix, now(), false, 1) on conflict do nothing")
        .param("task", TASK_NAME)
        .param("prefix", prefix)
        .update();
  }
}
