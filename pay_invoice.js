require('dotenv').config();
const mongoose = require('mongoose');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const fs = require('fs');
  const invoiceId = fs.readFileSync('/tmp/invoice_id.txt', 'utf8').trim();
  console.log("Invoice ID:", invoiceId);

  // Directly update invoice to test logic
  const invoiceService = require('./src/modules/invoice/invoice.service').default;
  try {
      const invoice = await invoiceService.updateInvoiceStatus(invoiceId, 'PAID');
      console.log("Invoice paid successfully");
      
      const orders = mongoose.connection.collection('orders');
      const order = await orders.findOne({ invoiceId: new mongoose.Types.ObjectId(invoiceId) });
      console.log("Order Status now:", order.status);
      
      const services = mongoose.connection.collection('services');
      const serviceList = await services.find({ orderId: order._id }).toArray();
      serviceList.forEach(s => {
          console.log(`Service ${s.type} status: ${s.status}`);
      });

  } catch (err) {
      console.error(err);
  }
  
  process.exit(0);
}
run().catch(console.error);
