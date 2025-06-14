const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();

app.use(express.json());
app.use(cors()); // Allows your website to connect to the backend

// Connect to MongoDB (Removed deprecated options)
mongoose.connect('mongodb+srv://wahileayush:wahileayush0506@ayushcluster.el3krdl.mongodb.net/clothstore?retryWrites=true&w=majority&appName=AyushCluster')
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

// Schema for Forms (created in form.html, shown in details.html)
const formSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true }, // 10-digit phone number
  name: { type: String, required: true },
  date: { type: String, required: true },
  products: [{
    name: String,
    quantity: Number,
    price: Number,
    checked: { type: Boolean, default: false } // For border change in details.html
  }],
  paid: { type: Boolean, default: false } // For payment status
});

const Form = mongoose.model('Form', formSchema);

// Schema for Sells (history in sells.html)
const sellSchema = new mongoose.Schema({
  phone: { type: String, required: true },
  name: { type: String, required: true },
  date: { type: String, required: true },
  total: { type: Number, required: true },
  products: [{
    name: String,
    quantity: Number,
    price: Number
  }],
  paymentDate: { type: String, required: true }
});

const Sell = mongoose.model('Sell', sellSchema);

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
  const { paymentDate } = req.body;
  try {
    const form = await Form.findOne({ phone });
    if (form) {
      form.paid = true;
      await form.save();

      // Save to sells history
      const total = form.products.reduce((sum, p) => sum + (p.price * p.quantity), 0);
      const sell = new Sell({
        phone: form.phone,
        name: form.name,
        date: form.date,
        total,
        products: form.products,
        paymentDate
      });
      await sell.save();

      res.json(form);
    } else {
      res.status(404).json({ error: 'Form not found' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Error marking as paid: ' + err.message });
  }
});

// API to get sells history (used in sells.html)
app.get('/sells', async (req, res) => {
  try {
    const sells = await Sell.find();
    res.json(sells);
  } catch (err) {
    res.status(500).json({ error: 'Error retrieving sells: ' + err.message });
  }
});

// API to get shopping history by phone (used in shopping.html)
app.get('/shopping/:phone', async (req, res) => {
  const { phone } = req.params;
  try {
    const sells = await Sell.find({ phone });
    res.json(sells);
  } catch (err) {
    res.status(500).json({ error: 'Error retrieving shopping history: ' + err.message });
  }
});

// Start the backend server
app.listen(3000, () => {
  console.log('Backend server running on http://localhost:3000');
});