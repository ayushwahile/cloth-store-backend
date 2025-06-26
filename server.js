const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios'); // Added for Fast2SMS API requests
require('dotenv').config(); // Added to load environment variables

const app = express();

app.use(express.json());
app.use(cors()); // Allows your website to connect to the backend

// Load Fast2SMS API key from environment variables
const FAST2SMS_API_KEY = process.env.FAST2SMS_API_KEY || 'EkqoTCwPlzqCgY8escbyntH2wc9kwSOT33009jjrqWjRTJnsag8bQg726Wt4';

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
    checked: { type: Boolean, default: false }
  }],
  paid: { type: Boolean, default: false },
  paymentDate: String,
  razorpayPaymentId: String
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
    selectedFloor: String
  }],
  paymentDate: { type: Date, required: true },
  razorpayPaymentId: String
});

const Sell = mongoose.model('Sell', sellSchema);

// Schema for Products (used in products.html)
const productSchema = new mongoose.Schema({
  brandName: { type: String, required: true },
  productName: { type: String, required: true },
  size: { type: String, required: true },
  originalMrp: { type: Number, required: true },
  adjustedMrp: { type: Number, required: true },
  ownerPhone: { type: String, required: true }
});

const Product = mongoose.model('Product', productSchema);

// Schema for Owner's Bank Balance (added for bank_payment.html)
const ownerBalanceSchema = new mongoose.Schema({
  ownerId: { type: String, required: true, unique: true },
  balance: { type: Number, default: 0 }
});

const OwnerBalance = mongoose.model('OwnerBalance', ownerBalanceSchema);

// Schema for OTP Sessions (used in owner.html and search.html)
const otpSessionSchema = new mongoose.Schema({
  phone: { type: String, required: true },
  otp: { type: String, required: true },
  createdAt: { type: Date, required: true, default: Date.now },
  expiresAt: { type: Date, required: true },
  verified: { type: Boolean, default: false }
});

const OTPSession = mongoose.model('OTPSession', otpSessionSchema);

// Schema for Accounts
const accountSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true },
  gmail: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  shopName: { type: String, required: true },
  place: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const Account = mongoose.model('Account', accountSchema);

// API to create or update a form (used in form.html and details.html)
app.post('/forms', async (req, res) => {
  const { phone, name, date, products } = req.body;
  try {
    let form = await Form.findOne({ phone });
    if (form) {
      if (products) {
        form.products = [...form.products, ...products];
      }
      await form.save();
      res.json(form);
    } else {
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
  const { phone } = req.query;
  if (!phone) {
    return res.status(400).json({ error: 'Phone number is required to fetch forms.' });
  }
  try {
    const fields = req.query.fields;
    let forms;
    forms = await Form.find({ phone }, fields === 'phone' ? 'phone' : {});
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
  const { paymentDate, products, razorpayPaymentId } = req.body;
  try {
    const form = await Form.findOne({ phone });
    if (!form) {
      return res.status(404).json({ error: 'Form not found' });
    }

    console.log('Received paymentDate:', paymentDate);
    form.paid = true;
    form.paymentDate = paymentDate;
    form.razorpayPaymentId = razorpayPaymentId;
    await form.save();

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
      paymentDate: new Date(paymentDate),
      razorpayPaymentId: razorpayPaymentId
    });
    await sell.save();
    console.log('Saved sell with paymentDate:', sell.paymentDate);

    let ownerBalance = await OwnerBalance.findOne({ ownerId: phone });
    if (!ownerBalance) {
      ownerBalance = new OwnerBalance({ ownerId: phone, balance: 0 });
    }
    ownerBalance.balance += total;
    await ownerBalance.save();

    const deleteResult = await Form.deleteOne({ phone });
    if (deleteResult.deletedCount === 1) {
      console.log(`Successfully deleted form with phone number ${phone} after payment`);
    } else {
      console.warn(`Form with phone number ${phone} was not found for deletion after payment`);
    }

    res.json(form);
  } catch (err) {
    console.error('Error in marking form as paid:', err.message);
    res.status(500).json({ error: 'Error marking as paid: ' + err.message });
  }
});

// API to get sells history (used in sells.html and products.html for sales history)
app.get('/sells', async (req, res) => {
  const { phone } = req.query;
  if (!phone) {
    return res.status(400).json({ error: 'Phone number is required to fetch sells.' });
  }
  try {
    const sells = await Sell.find({ phone }).sort({ paymentDate: -1 });
    console.log('Fetched sells for phone:', phone, sells.map(sell => ({ phone: sell.phone, paymentDate: sell.paymentDate })));
    res.json(sells);
  } catch (err) {
    res.status(500).json({ error: 'Error retrieving sells: ' + err.message });
  }
});

// API to get shopping history by phone (used in shopping.html)
app.get('/shopping/:phone', async (req, res) => {
  const { phone } = req.params;
  try {
    const sells = await Sell.find({ phone }).sort({ paymentDate: -1 });
    res.json(sells);
  } catch (err) {
    res.status(500).json({ error: 'Error retrieving shopping history: ' + err.message });
  }
});

// API to get all products (used in products.html and details.html)
app.get('/products', async (req, res) => {
  const { phone } = req.query;
  if (!phone) {
    return res.status(400).json({ error: 'Phone number is required to fetch products.' });
  }
  try {
    const products = await Product.find({ ownerPhone: phone });
    const formattedProducts = products.map(product => ({
      ...product._doc,
      mrp: product.adjustedMrp
    }));
    res.json(formattedProducts);
  } catch (err) {
    res.status(500).json({ error: 'Error retrieving products: ' + err.message });
  }
});

// API to create a new product (used in products.html)
app.post('/products', async (req, res) => {
  const { brandName, productName, size, mrp, phone } = req.body;
  if (!phone || !/^\d{10}$/.test(phone)) {
    return res.status(400).json({ error: 'Invalid or missing phone number. Must be a 10-digit number.' });
  }
  try {
    const originalMrp = Number(mrp);
    const adjustedMrp = originalMrp + 10;
    console.log(`Creating product with original MRP: ${originalMrp}, adjusted MRP: ${adjustedMrp} for phone: ${phone}`);
    const product = new Product({ brandName, productName, size, originalMrp, adjustedMrp, ownerPhone: phone });
    await product.save();
    res.status(201).json({ ...product._doc, mrp: adjustedMrp });
  } catch (err) {
    res.status(500).json({ error: 'Error creating product: ' + err.message });
  }
});

// API to update a product (used in products.html)
app.put('/products/:id', async (req, res) => {
  const { id } = req.params;
  const { brandName, productName, size, mrp, phone } = req.body;
  if (!phone || !/^\d{10}$/.test(phone)) {
    return res.status(400).json({ error: 'Invalid or missing phone number. Must be a 10-digit number.' });
  }
  try {
    const originalMrp = Number(mrp);
    const adjustedMrp = originalMrp + 10;
    console.log(`Updating product ID: ${id} with original MRP: ${originalMrp}, adjusted MRP: ${adjustedMrp} for phone: ${phone}`);
    const product = await Product.findByIdAndUpdate(
      id,
      { brandName, productName, size, originalMrp, adjustedMrp, ownerPhone: phone },
      { new: true }
    );
    if (product) {
      res.json({ ...product._doc, mrp: adjustedMrp });
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
  const { phone } = req.query;
  try {
    const ownerBalance = await OwnerBalance.findOne({ ownerId: phone || 'owner' });
    if (ownerBalance) {
      res.json({ balance: ownerBalance.balance });
    } else {
      const newBalance = new OwnerBalance({ ownerId: phone || 'owner', balance: 0 });
      await newBalance.save();
      res.json({ balance: 0 });
    }
  } catch (err) {
    res.status(500).json({ error: 'Error retrieving balance: ' + err.message });
  }
});

// API to update owner's bank balance (added for bank_payment.html)
app.put('/owner-balance', async (req, res) => {
  const { amount, phone } = req.body;
  try {
    let ownerBalance = await OwnerBalance.findOne({ ownerId: phone || 'owner' });
    if (!ownerBalance) {
      ownerBalance = new OwnerBalance({ ownerId: phone || 'owner', balance: 0 });
    }
    ownerBalance.balance += amount;
    await ownerBalance.save();
    res.json({ balance: ownerBalance.balance });
  } catch (err) {
    res.status(500).json({ error: 'Error updating balance: ' + err.message });
  }
});

// Razorpay integration
const Razorpay = require('razorpay');
const razorpay = new Razorpay({
  key_id: 'rzp_test_2TQGkf0MgdCKqg',
  key_secret: 'uoIibpGn0Me560q0oRodQjrL'
});

// API to create a Razorpay order
app.post('/create-order', async (req, res) => {
  const { amount, customerPhone } = req.body;
  try {
    if (!amount || !customerPhone) {
      throw new Error('Amount and customer phone are required');
    }

    const order = await razorpay.orders.create({
      amount: amount * 100,
      currency: 'INR',
      receipt: `receipt_${customerPhone}_${Date.now()}`,
      notes: {
        phone: customerPhone
      }
    });
    res.json({ order_id: order.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API to verify payment
app.post('/verify-payment', async (req, res) => {
  const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;
  try {
    const generated_signature = require('crypto')
      .createHmac('sha256', 'uoIibpGn0Me560q0oRodQjrL')
      .update(razorpay_order_id + '|' + razorpay_payment_id)
      .digest('hex');

    if (generated_signature === razorpay_signature) {
      res.json({ status: 'success', message: 'Payment verified successfully' });
    } else {
      res.status(400).json({ status: 'failure', message: 'Payment verification failed' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Error verifying payment: ' + err.message });
  }
});

// API to handle payment callback from Razorpay
app.post('/payment-callback', async (req, res) => {
  console.log('Received payment callback at', new Date().toISOString(), ':', req.body);
  const { razorpay_payment_id, razorpay_order_id, razorpay_signature, notes } = req.body;

  if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature || !notes || !notes.phone) {
    console.error('Missing required payment data at', new Date().toISOString(), ':', req.body);
    return res.status(400).json({ error: 'Missing required payment data' });
  }

  let form;
  try {
    console.log('Verifying signature...');
    const generated_signature = require('crypto')
      .createHmac('sha256', 'uoIibpGn0Me560q0oRodQjrL')
      .update(razorpay_order_id + '|' + razorpay_payment_id)
      .digest('hex');
    if (generated_signature !== razorpay_signature) {
      console.error('Signature verification failed at', new Date().toISOString(), ': Generated', generated_signature, 'Received', razorpay_signature);
      return res.status(400).json({ error: 'Payment signature verification failed' });
    }
    console.log('Signature verified successfully');

    const phone = notes.phone;
    console.log('Finding form for phone:', phone);
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        form = await Form.findOne({ phone });
        if (form) break;
        console.warn(`Form not found for phone ${phone} on attempt ${attempt}, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      } catch (dbErr) {
        console.error(`Database error on attempt ${attempt} for phone ${phone}:`, dbErr.message);
        if (attempt === 3) throw dbErr;
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
    if (!form) {
      console.error('Form not found after retries for phone:', phone, 'at', new Date().toISOString());
      return res.status(404).json({ error: 'Form not found after retries' });
    }
    console.log('Form found:', form);

    const paymentDate = new Date().toISOString();
    console.log('Updating form as paid with paymentDate:', paymentDate);
    form.paid = true;
    form.paymentDate = paymentDate;
    form.razorpayPaymentId = razorpay_payment_id;
    await form.save();
    console.log('Form updated:', form);

    const total = form.products.reduce((sum, p) => sum + (p.mrp || 0), 0);
    console.log('Calculating total:', total);
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
      paymentDate: new Date(paymentDate),
      razorpayPaymentId: razorpay_payment_id
    });
    await sell.save();
    console.log('Sell saved:', sell);

    let ownerBalance = await OwnerBalance.findOne({ ownerId: phone });
    if (!ownerBalance) {
      ownerBalance = new OwnerBalance({ ownerId: phone, balance: 0 });
    }
    ownerBalance.balance += total;
    await ownerBalance.save();
    console.log('Owner balance updated to:', ownerBalance.balance);

    console.log('Deleting form for phone:', phone);
    const deleteResult = await Form.deleteOne({ phone });
    if (deleteResult.deletedCount === 1) {
      console.log('Form deleted successfully');
    } else {
      console.warn('Form not found for deletion, possibly already deleted');
    }

    const redirectUrl = `https://clothstoreayush.netlify.app/ownerButton/owner_home.html?phone=${encodeURIComponent(phone)}&payment_id=${encodeURIComponent(razorpay_payment_id)}`;
    console.log('Redirecting to:', redirectUrl);
    res.redirect(302, redirectUrl);
  } catch (err) {
    console.error('Error in payment callback at', new Date().toISOString(), ':', {
      message: err.message,
      stack: err.stack,
      body: req.body,
      formExists: form ? true : false
    });
    res.status(500).json({ error: 'Internal Server Error: ' + err.message });
  }
});

// API to get pending payments for the previous day (used in owner_home.html)
app.get('/pending-payments/previous-day', async (req, res) => {
  const { phone } = req.query;
  try {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yesterdayStart = yesterday.toISOString().split('T')[0];

    const pendingPayments = await PendingPayment.find({
      phone: phone,
      timestamp: { $gte: `${yesterdayStart}T00:00:00.000Z`, $lt: `${yesterdayStart}T23:59:59.999Z` },
      paid: false
    });

    console.log('Fetched previous day pending payments:', pendingPayments);
    res.json(pendingPayments);
  } catch (err) {
    console.error('Error retrieving previous day pending payments:', err);
    res.status(500).json({ error: 'Error retrieving pending payments: ' + err.message });
  }
});

// API to mark a single pending payment as paid
app.put('/pending-payments/pay', async (req, res) => {
  const { timestamp } = req.body;
  try {
    const pendingPayment = await PendingPayment.findOneAndUpdate(
      { timestamp, paid: false },
      { paid: true },
      { new: true }
    );
    if (pendingPayment) {
      let ownerBalance = await OwnerBalance.findOne({ ownerId: pendingPayment.phone });
      if (!ownerBalance) {
        ownerBalance = new OwnerBalance({ ownerId: pendingPayment.phone, balance: 0 });
      }
      ownerBalance.balance += pendingPayment.amount;
      await ownerBalance.save();

      console.log(`Marked pending payment as paid: timestamp=${timestamp}, amount=${pendingPayment.amount}, new owner balance=${ownerBalance.balance}`);
      res.json({ message: 'Pending payment marked as paid', balance: ownerBalance.balance });
    } else {
      console.warn(`Pending payment not found or already paid: timestamp=${timestamp}`);
      res.status(404).json({ error: 'Pending payment not found or already paid' });
    }
  } catch (err) {
    console.error('Error marking payment as paid:', err);
    res.status(500).json({ error: 'Error marking payment as paid: ' + err.message });
  }
});

// API to send OTP for owner (used in owner.html, checks if account exists)
app.post('/send-otp', async (req, res) => {
  const { phone } = req.body;
  try {
    if (!phone || phone.length !== 10 || !/^\d{10}$/.test(phone)) {
      return res.status(400).json({ error: 'Invalid phone number. Must be a 10-digit number.' });
    }

    const account = await Account.findOne({ phone });
    if (!account) {
      return res.status(404).json({ error: 'ACCOUNT NOT CREATED' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + 10 * 60 * 1000);

    await OTPSession.deleteMany({ phone });
    const otpSession = new OTPSession({ phone, otp, createdAt, expiresAt, verified: false });
    await otpSession.save();

    const response = await axios.post(
      'https://www.fast2sms.com/dev/bulkV2',
      {
        route: 'otp',
        variables_values: otp,
        numbers: phone,
        flash: 0
      },
      {
        headers: {
          authorization: FAST2SMS_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.return !== true) {
      console.error('Fast2SMS Error Details:', response.data);
      return res.status(500).json({ error: 'Failed to send OTP via SMS.', details: response.data.message || 'Unknown error from Fast2SMS' });
    }

    console.log(`OTP sent to ${phone}: ${otp}`);
    res.status(200).json({ message: 'OTP sent successfully' });
  } catch (err) {
    console.error('Error sending OTP:', err.message);
    res.status(500).json({ error: 'Error sending OTP: ' + err.message });
  }
});

// API to send OTP for form creation (used in search.html and shopping.html, allows any 10-digit phone number)
app.post('/send-otp-form', async (req, res) => {
  const { phone } = req.body;
  try {
    if (!phone || phone.length !== 10 || !/^\d{10}$/.test(phone)) {
      return res.status(400).json({ error: 'Invalid phone number. Must be a 10-digit number.' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + 10 * 60 * 1000);

    await OTPSession.deleteMany({ phone });
    const otpSession = new OTPSession({ phone, otp, createdAt, expiresAt, verified: false });
    await otpSession.save();

    const response = await axios.post(
      'https://www.fast2sms.com/dev/bulkV2',
      {
        route: 'otp',
        variables_values: otp,
        numbers: phone,
        flash: 0
      },
      {
        headers: {
          authorization: FAST2SMS_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.return !== true) {
      console.error('Fast2SMS Error Details:', response.data);
      return res.status(500).json({ error: 'Failed to send OTP via SMS.', details: response.data.message || 'Unknown error from Fast2SMS' });
    }

    console.log(`OTP sent to ${phone}: ${otp}`);
    res.status(200).json({ message: 'OTP sent successfully' });
  } catch (err) {
    console.error('Error sending OTP for form creation:', err.message);
    res.status(500).json({ error: 'Error sending OTP: ' + err.message });
  }
});

// API to send OTP for account creation
app.post('/send-otp-create', async (req, res) => {
  const { phone } = req.body;
  try {
    if (!phone || phone.length !== 10 || !/^\d{10}$/.test(phone)) {
      return res.status(400).json({ error: 'Invalid phone number. Must be a 10-digit number.' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + 10 * 60 * 1000);

    // Ensure only one active OTP session per phone
    await OTPSession.deleteMany({ phone, verified: false });
    const otpSession = new OTPSession({ phone, otp, createdAt, expiresAt, verified: false });
    await otpSession.save();

    const response = await axios.post(
      'https://www.fast2sms.com/dev/bulkV2',
      {
        route: 'otp',
        variables_values: otp,
        numbers: phone,
        flash: 0
      },
      {
        headers: {
          authorization: FAST2SMS_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.return !== true) {
      console.error('Fast2SMS Error Details:', response.data);
      return res.status(500).json({ error: 'Failed to send OTP via SMS.', details: response.data.message || 'Unknown error from Fast2SMS' });
    }

    console.log(`OTP sent to ${phone}: ${otp}`);
    res.status(200).json({ message: 'OTP sent successfully' });
  } catch (err) {
    console.error('Error sending OTP for account creation:', err.message);
    res.status(500).json({ error: 'Error sending OTP: ' + err.message });
  }
});

// API to verify OTP for account creation
app.post('/verify-otp-create', async (req, res) => {
  const { phone, otp } = req.body;
  try {
    if (!phone || !otp) {
      return res.status(400).json({ error: 'Phone number and OTP are required.' });
    }

    const otpSession = await OTPSession.findOne({ phone, verified: false }).sort({ createdAt: -1 });

    if (!otpSession) {
      return res.status(404).json({ error: 'No OTP session found for this phone number.' });
    }

    const now = new Date();
    if (now > otpSession.expiresAt) {
      await OTPSession.deleteOne({ _id: otpSession._id });
      return res.status(400).json({ error: 'OTP has expired.' });
    }

    if (otpSession.otp !== otp) {
      return res.status(400).json({ error: 'Invalid OTP.' });
    }

    otpSession.verified = true;
    await otpSession.save();
    await OTPSession.deleteOne({ _id: otpSession._id });

    res.status(200).json({ message: 'OTP verified successfully' });
  } catch (err) {
    console.error('Error verifying OTP for account creation:', err.message);
    res.status(500).json({ error: 'Error verifying OTP: ' + err.message });
  }
});

// API to create an account
app.post('/create-account', async (req, res) => {
  const { phone, name, gmail, shopName, place } = req.body;
  console.log('Received create-account request:', { phone, name, gmail, shopName, place });
  try {
    if (!phone || !name || !gmail || !shopName || !place) {
      return res.status(400).json({ error: 'All fields (phone, name, gmail, shopName, place) are required.' });
    }

    const existingAccount = await Account.findOne({ $or: [{ phone }, { gmail }] });
    if (existingAccount) {
      return res.status(400).json({ error: 'Phone number or Gmail already registered.' });
    }

    const account = new Account({ phone, name, gmail, shopName, place });
    await account.save();
    console.log('Account created successfully for phone:', phone);

    res.status(201).json({ message: 'Account created successfully' });
  } catch (err) {
    console.error('Error creating account:', err.message);
    res.status(500).json({ error: 'Error creating account: ' + err.message });
  }
});

// API to delete a product from a form (used in details.html)
app.delete('/forms/:phone/products/:productIndex', async (req, res) => {
  const { phone, productIndex } = req.params;
  try {
    const form = await Form.findOne({ phone });
    if (!form) {
      return res.status(404).json({ error: 'Form not found' });
    }

    const index = parseInt(productIndex, 10);
    if (isNaN(index) || index < 0 || index >= form.products.length) {
      return res.status(400).json({ error: 'Invalid product index' });
    }

    form.products.splice(index, 1);
    await form.save();

    res.json({ message: 'Product deleted successfully', updatedForm: form });
  } catch (err) {
    console.error('Error deleting product from form:', err.message);
    res.status(500).json({ error: 'Error deleting product: ' + err.message });
  }
});

// API to verify OTP for owner login
app.post('/verify-otp', async (req, res) => {
  const { phone, otp } = req.body;
  try {
    if (!phone || !otp) {
      return res.status(400).json({ error: 'Phone number and OTP are required.' });
    }

    const otpSession = await OTPSession.findOne({ phone }).sort({ createdAt: -1 });

    if (!otpSession) {
      return res.status(404).json({ error: 'No OTP session found for this phone number.' });
    }

    const now = new Date();
    if (now > otpSession.expiresAt) {
      return res.status(400).json({ error: 'OTP has expired.' });
    }

    if (otpSession.verified) {
      return res.status(400).json({ error: 'OTP has already been used.' });
    }

    if (otpSession.otp !== otp) {
      return res.status(400).json({ error: 'Invalid OTP.' });
    }

    otpSession.verified = true;
    await otpSession.save();
    await OTPSession.deleteOne({ _id: otpSession._id });

    res.status(200).json({ message: 'OTP verified successfully' });
  } catch (err) {
    console.error('Error verifying OTP for owner login:', err.message);
    res.status(500).json({ error: 'Error verifying OTP: ' + err.message });
  }
});

// API to get owner details by phone
app.get('/owner-details/:phone', async (req, res) => {
  const { phone } = req.params;
  try {
    const account = await Account.findOne({ phone });
    if (account) {
      res.json(account);
    } else {
      res.status(404).json({ error: 'Account not found' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Error retrieving owner details: ' + err.message });
  }
});

// Start the backend server
app.listen(process.env.PORT || 3000, () => {
  console.log('Backend server running on http://localhost:' + (process.env.PORT || 3000));
});