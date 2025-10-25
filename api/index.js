const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// --- MONGODB CONNECTION ---
// !!! IMPORTANT: Replace this with your own MongoDB Atlas connection string
const MONGODB_URI =process.env.MONGODB_URI;
const JWT_SECRET = "your-jwt-secret-key-for-college-project"; // Change this to a random string

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected...'))
.catch(err => console.error('MongoDB connection error:', err));

// --- DATA STRUCTURES ---

/**
 * Hash Table (for Passwords)
 * Implemented implicitly by bcrypt.
 * bcrypt.hash() creates a hash (digest) of the password.
 * bcrypt.compare() uses a secure, time-constant method to check a password against a hash,
 * preventing timing attacks.
 */

/**
 * Hash Table (for Filtering)
 * Implemented by dynamically building a query object for MongoDB.
 * This is a { key: value } map, which is a classic Hash Table.
 */

/**
 * Priority Queue (Max-Heap) for sorting listings
 * This ensures "boosted" listings (higher priority) are always at the top.
 */
class PriorityQueue {
    constructor() {
        this.heap = [];
    }

    isEmpty() { return this.heap.length === 0; }
    parent(i) { return Math.floor((i - 1) / 2); }
    leftChild(i) { return 2 * i + 1; }
    rightChild(i) { return 2 * i + 2; }

    // Compare listings:
    // 1. Higher priority wins
    // 2. If priority is equal, newer createdAt timestamp wins
    compare(a, b) {
        if (a.priority !== b.priority) {
            return a.priority > b.priority;
        }
        return a.createdAt > b.createdAt;
    }

    swap(i, j) {
        [this.heap[i], this.heap[j]] = [this.heap[j], this.heap[i]];
    }

    insert(listing) {
        this.heap.push(listing);
        this.heapifyUp(this.heap.length - 1);
    }

    heapifyUp(i) {
        let currentIndex = i;
        let parentIndex = this.parent(currentIndex);
        while (currentIndex > 0 && this.compare(this.heap[currentIndex], this.heap[parentIndex])) {
            this.swap(currentIndex, parentIndex);
            currentIndex = parentIndex;
            parentIndex = this.parent(currentIndex);
        }
    }

    extractMax() {
        if (this.isEmpty()) return null;
        if (this.heap.length === 1) return this.heap.pop();

        const max = this.heap[0];
        this.heap[0] = this.heap.pop();
        this.heapifyDown(0);
        return max;
    }

    heapifyDown(i) {
        let currentIndex = i;
        let left = this.leftChild(currentIndex);
        let right = this.rightChild(currentIndex);
        let largest = currentIndex;

        if (left < this.heap.length && this.compare(this.heap[left], this.heap[largest])) {
            largest = left;
        }
        if (right < this.heap.length && this.compare(this.heap[right], this.heap[largest])) {
            largest = right;
        }

        if (largest !== currentIndex) {
            this.swap(currentIndex, largest);
            this.heapifyDown(largest);
        }
    }
}

// --- DATABASE SCHEMAS (Mongoose) ---

// `users` Collection
const UserSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
    phoneNumbers: { type: [String], required: true }, // Array/List
    listingsHistory: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Listing' }], // Array/List
    purchaseHistory: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Listing' }], // Array/List
});

const User = mongoose.model('User', UserSchema);

// `listings` Collection
const ListingSchema = new mongoose.Schema({
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    eventName: { type: String, required: true },
    city: { type: String, required: true, index: true },
    passType: { type: String, required: true, index: true }, // Male, Female, Couple, etc.
    status: { type: String, default: 'available', index: true }, // available, sold
    price: { type: Number, required: true },
    sellerPhoneNumber: { type: String, required: true },
    availableDates: { type: [String], required: true }, // Array/List
    tags: [String], // Array/List
    description: String,
    createdAt: { type: Date, default: Date.now, index: true },
    priority: { type: Number, default: 1 }, // 1 for normal, 10 for boosted
});

const Listing = mongoose.model('Listing', ListingSchema);

// --- AUTH MIDDLEWARE ---
// Middleware to verify JWT token
const authMiddleware = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

    if (token == null) {
        return res.status(401).json({ message: "No token, authorization denied." });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // Add user payload to request
        next();
    } catch (e) {
        res.status(400).json({ message: "Token is not valid." });
    }
};

// --- API ENDPOINTS ---

// 1. AUTH ENDPOINTS

// POST /api/auth/signup
app.post('/api/auth/signup', async (req, res) => {
    try {
        const { email, password, phoneNumber } = req.body;
        if (!email || !password || !phoneNumber) {
            return res.status(400).json({ message: "Please provide email, password, and phone number." });
        }

        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ message: "User already exists." });
        }

        // HASH TABLE (Password Hashing)
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        user = new User({
            email,
            passwordHash,
            phoneNumbers: [phoneNumber]
        });

        await user.save();

        // Generate token
        const payload = { id: user.id, email: user.email };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '3h' });

        res.status(201).json({ token, user: { id: user.id, email: user.email } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server Error" });
    }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: "Please provide email and password." });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: "Invalid credentials." });
        }

        // HASH TABLE (Password Comparison)
        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) {
            return res.status(400).json({ message: "Invalid credentials." });
        }

        // Generate token
        const payload = { id: user.id, email: user.email };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '3h' });

        res.status(200).json({ token, user: { id: user.id, email: user.email } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server Error" });
    }
});

// 2. LISTING ENDPOINTS

// GET /api/listings
// This is the main endpoint for discovery, filtering, and sorting.
app.get('/api/listings', async (req, res) => {
    try {
        // HASH TABLE (for Filters)
        // We build a dynamic filter object based on query parameters.
        const filterQuery = { status: 'available' };
        
        if (req.query.city) {
            filterQuery.city = req.query.city;
        }
        if (req.query.passType) {
            filterQuery.passType = req.query.passType;
        }
        if (req.query.date) {
            // This checks if the date is in the 'availableDates' array
            filterQuery.availableDates = req.query.date;
        }
        if (req.query.q) {
            // Simple regex search for event name
            filterQuery.eventName = { $regex: req.query.q, $options: 'i' };
        }

        // 1. Fetch filtered results from MongoDB
        const listings = await Listing.find(filterQuery);

        // 2. Insert into Priority Queue (Max-Heap) for sorting
        const pq = new PriorityQueue();
        for (const listing of listings) {
            pq.insert(listing);
        }

        // 3. Extract from Priority Queue to get sorted list
        const sortedListings = [];
        while (!pq.isEmpty()) {
            sortedListings.push(pq.extractMax());
        }

        res.status(200).json(sortedListings);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server Error" });
    }
});

// GET /api/listings/event-names (for Trie)
app.get('/api/listings/event-names', async (req, res) => {
    try {
        // Get all unique event names and their listing IDs
        const events = await Listing.aggregate([
            { $match: { status: 'available' } },
            { $group: {
                _id: "$eventName", // Group by event name
                listingIds: { $addToSet: "$_id" } // Collect unique listing IDs
            }}
        ]);
        
        // Format for the Trie on the frontend
        const eventMap = events.map(e => ({
            name: e._id,
            ids: e.listingIds
        }));
        
        res.status(200).json(eventMap);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server Error" });
    }
});


// POST /api/listings (Create Listing)
app.post('/api/listings', authMiddleware, async (req, res) => {
    try {
        const { 
            eventName, city, passType, price, sellerPhoneNumber, 
            availableDates, description, tags, isBoosted 
        } = req.body;
        
        // Validation
        if (!eventName || !city || !passType || !price || !sellerPhoneNumber || !availableDates) {
            return res.status(400).json({ message: "Please fill all required fields." });
        }

        const newListing = new Listing({
            sellerId: req.user.id,
            eventName,
            city,
            passType,
            price,
            sellerPhoneNumber,
            availableDates,
            description,
            tags: tags || [],
            priority: isBoosted ? 10 : 1, // Set priority based on boost
            createdAt: new Date()
        });

        const savedListing = await newListing.save();
        
        // Add to user's listing history
        await User.findByIdAndUpdate(
            req.user.id,
            { $push: { listingsHistory: savedListing._id } }
        );

        res.status(201).json(savedListing);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server Error" });
    }
});

// GET /api/listings/my-listings
app.get('/api/listings/my-listings', authMiddleware, async (req, res) => {
    try {
        const listings = await Listing.find({ sellerId: req.user.id }).sort({ createdAt: -1 });
        res.status(200).json(listings);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server Error" });
    }
});

app.put('/api/listings/:id/sold', authMiddleware, async (req, res) => {
    try {
        const listing = await Listing.findById(req.params.id);

        // Check 1: Does the listing exist?
        if (!listing) {
            return res.status(404).json({ message: "Listing not found." });
        }

        // Check 2: Does the logged-in user own this listing? (Authorization)
        if (listing.sellerId.toString() !== req.user.id) {
            return res.status(403).json({ message: "User not authorized to modify this listing." });
        }
        
        // Check 3: Is the listing already sold?
        if (listing.status === 'sold') {
            return res.status(400).json({ message: "Listing is already marked as sold." });
        }

        // Update the status and save
        listing.status = 'sold';
        await listing.save();

        res.status(200).json(listing); // Return the updated listing
    } catch (err) {
        console.error("Mark as Sold Error:", err);
        res.status(500).json({ message: "Server Error" });
    }
});

// GET /api/listings/:id/contact (Get Seller Info)
// This simulates the buyer's $10 payment.
app.get('/api/listings/:id/contact', authMiddleware, async (req, res) => {
    try {
        const listing = await Listing.findById(req.params.id);
        
        if (!listing) {
            return res.status(404).json({ message: "Listing not found." });
        }

        // Add to user's purchase history
        await User.findByIdAndUpdate(
            req.user.id,
            { $addToSet: { purchaseHistory: listing._id } } // $addToSet prevents duplicates
        );
        
        // Return the gated contact info
        res.status(200).json({ 
            phoneNumber: listing.sellerPhoneNumber,
            sellerId: listing.sellerId
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server Error" });
    }
});

// --- ROOT ENDPOINT for Vercel ---
// This handles requests to the root that are not for the API.
// We'll let Vercel's rewrites handle serving index.html.
app.get('/', (req, res) => {
    res.send('Welcome to the Navaratri Pass Exchange API. The frontend should be served by Vercel rewrites.');
});

// Export the app for Vercel
module.exports = app;