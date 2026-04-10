const replicaSetName = process.env.MONGO_REPLICA_SET || "rs0";
const mongoHost = process.env.MONGO_HOST || "mongo";
const mongoPort = process.env.MONGO_PORT || "27017";

const config = {
  _id: replicaSetName,
  members: [{ _id: 0, host: `${mongoHost}:${mongoPort}` }],
};

try {
  const status = rs.status();
  if (status.ok === 1) {
    print(`Replica set already initialized: ${status.set}`);
  } else {
    print("Replica set status is not healthy; attempting initiate.");
    rs.initiate(config);
  }
} catch (err) {
  print(`Initializing replica set ${replicaSetName}...`);
  rs.initiate(config);
}

try {
  rs.status();
  print("Replica set is ready.");
} catch (err) {
  print("Replica set initialization was requested; status check will pass shortly.");
}
