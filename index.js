const {
    AckPolicy,
    DeliverPolicy,
    DiscardPolicy,
    ReplayPolicy,
    RetentionPolicy,
    connect,
} = require("nats");

(async () => {
    const connection = await connect({
        servers: ["nats.dev:4222", "localhost:4222"],
        reconnect: true,
        reconnectTimeWait: 5_000,
        maxReconnectAttempts: 100,
        verbose: true, //NODE_ENV === 'development' || NODE_ENV === 'test',
        timeout: 30_000,
        waitOnFirstConnect: true,
        pedantic: true,
    });
    console.log(`connected to ${connection.getServer()}`);

    const jetstreamManager = await connection.jetstreamManager();
    console.log(`connected to jetstream manager`);

    const streamName = "STREAM_NAME";
    const subjectName = "some.subject";

    console.log(`retrieving stream: ${streamName}`);

    // Adding a stream is an idempotent function, which means that
    // if a stream does not exist, it will be created, and if a
    // stream already exists, then the add operation will succeed
    // only if the existing stream matches exactly the attributes
    // specified in the 'add' call.
    const streamInfo = await jetstreamManager.streams.add({
        name: streamName,
        subjects: [subjectName],
        retention: RetentionPolicy.Workqueue,
        no_ack: false,
        num_replicas: 1,
        discard: DiscardPolicy.Old,
        max_bytes: 10e9, // 10GB in bytes
        max_age: 0, // infinite
    });
    console.log(
        `retrieved stream (info): ${JSON.stringify(streamInfo, undefined, 2)}`
    );

    const queueConsumerInfo = await jetstreamManager.consumers.add(
        streamInfo.config.name,
        {
            filter_subject: subjectName,
            inactive_threshold: 5e9, // 5s in nanoseconds
            ack_wait: 2e9, // 2s in nanoseconds
            ack_policy: AckPolicy.Explicit,
            deliver_policy: DeliverPolicy.All,
            replay_policy: ReplayPolicy.Instant,
            description: "queue consumer",
        }
    );
    console.log(
        `added stream consumer: ${queueConsumerInfo.name}\nwith subject filter: ${queueConsumerInfo.config.filter_subject}`
    );

    (await jetstreamManager.consumers.list(streamName).next()).forEach(
        (consumer, ii) => {
            console.log(
                `consumer ${ii} info: ${JSON.stringify(consumer, undefined, 2)}`
            );
        }
    );

    process.once("exit", () => {
        console.log("removing consumer");
        jetstreamManager.consumers.delete(
            streamInfo.config.name,
            queueConsumerInfo.name
        );
    });

    const jetstreamClient = connection.jetstream();
    console.log(`connected to jetstream client`);

    const pullSubscription = await jetstreamClient.pullSubscribe(
        subjectName,
        queueConsumerInfo
    );
    console.log(
        `created pull subscription for consumer: ${JSON.stringify(
            await pullSubscription.consumerInfo(),
            undefined,
            2
        )}`
    );
})();
