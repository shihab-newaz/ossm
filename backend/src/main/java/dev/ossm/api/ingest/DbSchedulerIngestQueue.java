package dev.ossm.api.ingest;

import com.github.kagkarlsson.scheduler.Scheduler;
import com.github.kagkarlsson.scheduler.task.FailureHandler;
import com.github.kagkarlsson.scheduler.task.helper.OneTimeTask;
import com.github.kagkarlsson.scheduler.task.helper.Tasks;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import javax.sql.DataSource;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.SmartLifecycle;
import org.springframework.stereotype.Component;

/**
 * The Postgres-backed adapter: jobs live in the scheduled_tasks table, so restarts lose nothing.
 */
@Component
@EnableConfigurationProperties(IngestProperties.class)
class DbSchedulerIngestQueue implements IngestQueue, SmartLifecycle {

  static final String TASK_NAME = "ingest-upload";

  private final Scheduler scheduler;
  private final OneTimeTask<Void> task;
  private final boolean runJobs;
  private volatile boolean running;

  DbSchedulerIngestQueue(DataSource dataSource, IngestProperties properties, IngestService ingest) {
    this.task =
        Tasks.oneTime(TASK_NAME, Void.class)
            .onFailure(new FailureHandler.OnFailureRetryLater<>(Duration.ofSeconds(30)))
            .execute((instance, context) -> ingest.ingest(UUID.fromString(instance.getId())));
    this.scheduler =
        Scheduler.create(dataSource, task)
            .threads(2)
            .pollingInterval(Duration.ofSeconds(1))
            .heartbeatInterval(properties.heartbeatInterval())
            .shutdownMaxWait(Duration.ofSeconds(30))
            .enableImmediateExecution()
            .build();
    this.runJobs = properties.enabled();
  }

  @Override
  public void enqueue(UUID uploadId) {
    var instance = task.instance(uploadId.toString());
    // schedule() refuses a duplicate id, which is exactly "safe to call twice".
    if (scheduler.getScheduledExecution(instance).isEmpty()) {
      scheduler.schedule(instance, Instant.now());
    }
  }

  @Override
  public void start() {
    if (runJobs) {
      scheduler.start();
    }
    running = true;
  }

  @Override
  public void stop() {
    scheduler.stop();
    running = false;
  }

  @Override
  public boolean isRunning() {
    return running;
  }
}
