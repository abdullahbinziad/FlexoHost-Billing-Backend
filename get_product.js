require('dotenv').config();
const mongoose = require('mongoose');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const tlds = mongoose.connection.collection('tlds');
  const tld = await tlds.findOne({});
  console.log(JSON.stringify(tld, null, 2));
  
  process.exit(0);
}
run().catch(console.error);
