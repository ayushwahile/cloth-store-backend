const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();

app.use(express.json());
app.use(cors()); // Allows your website to connect to the backend

// Connect to MongoDB
mongoose.connect('mongodb+srv://wahileayush:wahileayush0506@ayushcluster.el3krdl.mongodb.net/clothstore?retryWrites=true&w=majority&appName=AyushCluster')
  .then(async () => {
    console.log('Connected to MongoDB');

    // Ensure unique index on the phone field in the forms collection
    try {
      await mongoose.connection.db.collection('forms').createIndex(
        { phone: 1 },
        { unique: true }
      );
      console.log('Unique index on phone field ensured in forms collection');
    } catch (err) {
      console.error('Error creating unique index on phone field:', err);
    }

    // Clean up duplicate phone numbers in the forms collection (one-time operation)
    try {
      const duplicates = await mongoose.connection.db.collection('forms').aggregate([
        { $group: { _id: "$phone", ids: { $addToSet: "$_id" }, count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } }
      ]).toArray();

      if (duplicates.length > 0) {
        console.log(`Found ${duplicates.length} phone numbers with duplicates. Cleaning up...`);
        for (const duplicate of duplicates) {
          const idsToRemove = duplicate.ids.slice(1); // Keep the first document, remove the rest
          await mongoose.connection.db.collection('forms').deleteMany({
            _id: { $in: idsToRemove }
          });
          console.log(`Removed duplicates for phone: ${duplicate._id}`);
        }
        console.log('Duplicate cleanup completed');
      } else {
        console.log('No duplicate phone numbers found in forms collection');
      }
    } catch (err) {
      console.error('Error cleaning up duplicates in forms collection:', err);
    }
  })
  .catch(err => console.error('MongoDB connection error:', err));

// Schema for Forms (created in form.html, shown in details.html)
const formSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true }, // 10-digit phone number
  name: { type: String, required: true },
  date: { type: String, required: true },
  products: [{
    brandName: String,
    productName: String,
    size: String,
    mrp: Number,
    selectedFloor: String,
    checked: { type: Boolean, default: false } // For border change in details.html
  }],
  paid: { type: Boolean, default: false }, // For payment status
  paymentDate: String // Added to store payment date
});

const Form = mongoose.model('Form', formSchema);

// Schema for Sells (history in sells.html)
const sellSchema = new mongoose.Schema({
  phone: { type: String, required: true },
  name: { type: String, required: true },
  date: { type: String, required: true },
  total: { type: Number, required: true },
  products: [{
    brandName: String,
    productName: String,
    size: String,
    mrp: Number,
    selectedFloor: String // Added to match formSchema and store selectedFloor
  }],
  paymentDate: { type: Date, required: true } // Changed to Date for proper sorting
});

const Sell = mongoose.model('Sell', sellSchema);

// Schema for Products (used in products.html)
const productSchema = new mongoose.Schema({
  brandName: { type: String, required: true },
  productName: { type: String, required: true },
  size: { type: String, required: true },
  mrp: { type: Number, required: true }
});

const Product = mongoose.model('Product', productSchema);

// Schema for Owner's Bank Balance (added for bank_payment.html)
const ownerBalanceSchema = new mongoose.Schema({
  ownerId: { type: String, required: true, unique: true }, // For simplicity, use a fixed ownerId
  balance: { type: Number, default: 0 }
});

const OwnerBalance = mongoose.model('OwnerBalance', ownerBalanceSchema);

// Schema for Pending Payments (used in pendingpayment.html and owner_home.html)
const pendingPaymentSchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  timestamp: { type: String, required: true },
  paid: { type: Boolean, default: false }
});

const PendingPayment = mongoose.model('PendingPayment', pendingPaymentSchema);

// API to create or update a form (used in form.html and details.html)
app.post('/forms', async (req, res) => {
  const { phone, name, date, products } = req.body;
  try {
    let form = await Form.findOne({ phone });
    if (form) {
      // Update existing form (e.g., add products)
      if (products) {
        form.products = [...form.products, ...products];
      }
      await form.save();
      res.json(form);
    } else {
      // Create new form
      form = new Form({ phone, name, date, products: products || [] });
      await form.save();
      res.status(201).json(form);
    }
  } catch (err) {
    res.status(500).json({ error: 'Error saving form: ' + err.message });
  }
});

// API to get all forms (used in search.html and search_.html)
app.get('/forms', async (req, res) => {
  try {
    const fields = req.query.fields; // Check for fields query parameter
    let forms;
    if (fields === 'phone') {
      forms = await Form.find({}, 'phone'); // Only fetch phone numbers
    } else {
      forms = await Form.find(); // Fetch full form data
    }
    res.json(forms);
  } catch (err) {
    res.status(500).json({ error: 'Error retrieving forms: ' + err.message });
  }
});

// API to get a form by phone number (used in search.html, search_.html, owner_home.html)
app.get('/forms/:phone', async (req, res) => {
  const { phone } = req.params;
  try {
    const form = await Form.findOne({ phone });
    if (form) {
      res.json(form);
    } else {
      res.status(404).json({ error: 'Form not found' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Error retrieving form: ' + err.message });
  }
});

// API to update product checked status (used in details.html for second user)
app.put('/forms/:phone/check-product', async (req, res) => {
  const { phone } = req.params;
  const { productIndex } = req.body;
  try {
    const form = await Form.findOne({ phone });
    if (form && form.products[productIndex]) {
      form.products[productIndex].checked = true;
      await form.save();
      res.json(form);
    } else {
      res.status(404).json({ error: 'Form or product not found' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Error updating product: ' + err.message });
  }
});

// API to mark form as paid (used in bank_payment.html)
app.put('/forms/:phone/paid', async (req, res) => {
  const { phone } = req.params;
  const { paymentDate, products } = req.body; // Include products from the request
  try {
    const form = await Form.findOne({ phone });
    if (form) {
      console.log('Received paymentDate:', paymentDate);
      form.paid = true;
      form.paymentDate = paymentDate; // Save the payment date
      await form.save();

      // Save to sells history
      const total = form.products.reduce((sum, p) => sum + (p.mrp || 0), 0);
      const sell = new Sell({
        phone: form.phone,
        name: form.name,
        date: form.date,
        total,
        products: form.products.map(product => ({
          brandName: product.brandName,
          productName: product.productName,
          size: product.size,
          mrp: product.mrp,
          selectedFloor: product.selectedFloor || ''
        })),
        paymentDate: new Date(paymentDate) // Convert string to Date
      });
      await sell.save();
      console.log('Saved sell with paymentDate:', sell.paymentDate);

      // Update owner's bank balance
      let ownerBalance = await OwnerBalance.findOne({ ownerId: 'owner' });
      if (!ownerBalance) {
        ownerBalance = new OwnerBalance({ ownerId: 'owner', balance: 0 });
      }
      ownerBalance.balance += total;
      await ownerBalance.save();

      res.json(form);
    } else {
      res.status(404).json({ error: 'Form not found' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Error marking as paid: ' + err.message });
  }
});

// API to get sells history (used in sells.html and products.html for sales history)
app.get('/sells', async (req, res) => {
  try {
    const sells = await Sell.find().sort({ paymentDate: -1 }); // Sort by paymentDate in descending order (newest first)
    console.log('Fetched sells:', sells.map(sell => ({ phone: sell.phone, paymentDate: sell.paymentDate })));
    res.json(sells);
  } catch (err) {
    res.status(500).json({ error: 'Error retrieving sells: ' + err.message });
  }
});

// API to get shopping history by phone (used in shopping.html)
app.get('/shopping/:phone', async (req, res) => {
  const { phone } = req.params;
  try {
    const sells = await Sell.find({ phone }).sort({ paymentDate: -1 }); // Sort by paymentDate in descending order
    res.json(sells);
  } catch (err) {
    res.status(500).json({ error: 'Error retrieving shopping history: ' + err.message });
  }
});

// API to get all products (used in products.html and details.html)
app.get('/products', async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: 'Error retrieving products: ' + err.message });
  }
});

// API to create a new product (used in products.html)
app.post('/products', async (req, res) => {
  const { brandName, productName, size, mrp } = req.body;
  try {
    const product = new Product({ brandName, productName, size, mrp });
    await product.save();
    res.status(201).json(product);
  } catch (err) {
    res.status(500).json({ error: 'Error creating product: ' + err.message });
  }
});

// API to update a product (used in products.html)
app.put('/products/:id', async (req, res) => {
  const { id } = req.params;
  const { brandName, productName, size, mrp } = req.body;
  try {
    const product = await Product.findByIdAndUpdate(
      id,
      { brandName, productName, size, mrp },
      { new: true }
    );
    if (product) {
      res.json(product);
    } else {
      res.status(404).json({ error: 'Product not found' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Error updating product: ' + err.message });
  }
});

// API to delete a product (used in products.html)
app.delete('/products/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const product = await Product.findByIdAndDelete(id);
    if (product) {
      res.json({ message: 'Product deleted' });
    } else {
      res.status(404).json({ error: 'Product not found' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Error deleting product: ' + err.message });
  }
});

// API to get owner's bank balance (added for bank_payment.html)
app.get('/owner-balance', async (req, res) => {
  try {
    const ownerBalance = await OwnerBalance.findOne({ ownerId: 'owner' });
    if (ownerBalance) {
      res.json({ balance: ownerBalance.balance });
    } else {
      const newBalance = new OwnerBalance({ ownerId: 'owner', balance: 0 });
      await newBalance.save();
      res.json({ balance: 0 });
    }
  } catch (err) {
    res.status(500).json({ error: 'Error retrieving balance: ' + err.message });
  }
});

// API to update owner's bank balance (added for bank_payment.html)
app.put('/owner-balance', async (req, res) => {
  const { amount } = req.body;
  try {
    let ownerBalance = await OwnerBalance.findOne({ ownerId: 'owner' });
    if (!ownerBalance) {
      ownerBalance = new OwnerBalance({ ownerId: 'owner', balance: 0 });
    }
    ownerBalance.balance += amount;
    await ownerBalance.save();
    res.json({ balance: ownerBalance.balance });
  } catch (err) {
    res.status(500).json({ error: 'Error updating balance: ' + err.message });
  }
});

// Razorpay integration (commented out temporarily to allow deployment)
// const Razorpay = require('razorpay');
// const razorpay = new Razorpay({
//   key_id: process.env.RAZORPAY_KEY_ID,
//   key_secret: process.env.RAZORPAY_KEY_SECRET
// });

// app.post('/create-payment-link', async (req, res) => {
//   const { amount, customerName, customerPhone } = req.body;
//   try {
//     if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
//       throw new Error('Razorpay credentials are missing');
//     }
//     const paymentLink = await razorpay.paymentLink.create({
//       amount: amount,
//       currency: 'INR',
//       description: `Payment for ${customerName}`,
//       customer: {
//         name: customerName,
//         contact: customerPhone
//       },
//       notify: {
//         sms: true,
//         email: false
//       }
//     });
//     res.json({ paymentLink: paymentLink.short_url });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

// API to save a pending payment
app.post('/pending-payments', async (req, res) => {
  const { amount, timestamp } = req.body;
  try {
    const pendingPayment = new PendingPayment({ amount, timestamp });
    await pendingPayment.save();
    res.status(201).json({ message: 'Pending payment saved successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Error saving pending payment: ' + err.message });
  }
});

// API to get pending payments for the previous day
app.get('/pending-payments/previous-day', async (req, res) => {
  try {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yesterdayStart = yesterday.toISOString().split('T')[0]; // e.g., "2025-06-14"

    const pendingPayments = await PendingPayment.find({
      timestamp: { $gte: `${yesterdayStart}T00:00:00.000Z`, $lt: `${yesterdayStart}T23:59:59.999Z` },
      paid: false
    });

    res.json(pendingPayments);
  } catch (err) {
    res.status(500).json({ error: 'Error retrieving pending payments: ' + err.message });
  }
});

// API to mark pending payments as paid
app.put('/pending-payments/pay', async (req, res) => {
  const { timestamp } = req.body;
  try {
    const pendingPayment = await PendingPayment.findOneAndUpdate(
      { timestamp, paid: false },
      { paid: true },
      { new: true }
    );
    if (pendingPayment) {
      // Update owner's bank balance for pending payment
      let ownerBalance = await OwnerBalance.findOne({ ownerId: 'owner' });
      if (!ownerBalance) {
        ownerBalance = new OwnerBalance({ ownerId: 'owner', balance: 0 });
      }
      ownerBalance.balance += pendingPayment.amount;
      await ownerBalance.save();

      res.json({ message: 'Pending payment marked as paid', balance: ownerBalance.balance });
    } else {
      res.status(404).json({ error: 'Pending payment not found or already paid' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Error marking payment as paid: ' + err.message });
  }
});

// Start the backend server
app.listen(process.env.PORT || 3000, () => {
  console.log('Backend server running on http://localhost:' + (process.env.PORT || 3000));
});