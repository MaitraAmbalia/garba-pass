// --- DATA STRUCTURES ---

/**
 * Trie (Prefix Tree)
 * Used for client-side autocomplete on the search bar.
 * this.root.children is a Hash Map { 'a': TrieNode, 'b': TrieNode, ... }
 * node.listings is a Set to store unique listing IDs.
 */
class TrieNode {
    constructor() {
        this.children = {}; // Hash Map for children
        this.isEndOfWord = false;
        this.listings = new Set(); // Set to store listing IDs
    }
}

class Trie {
    constructor() {
        this.root = new TrieNode();
    }

    // Insert a word (event name) into the trie
    insert(word, listingId) {
        let node = this.root;
        for (const char of word.toLowerCase()) {
            if (!node.children[char]) {
                node.children[char] = new TrieNode();
            }
            node = node.children[char];
        }
        node.isEndOfWord = true;
        node.listings.add(listingId);
    }

    // Find all listing IDs for a given prefix
    findListingsByPrefix(prefix) {
        let node = this.root;
        for (const char of prefix.toLowerCase()) {
            if (!node.children[char]) {
                return new Set(); // No matches
            }
            node = node.children[char];
        }
        // Collect all listing IDs from this node and all its descendants
        return this._collectAllListings(node);
    }

    _collectAllListings(node) {
        let results = new Set(node.listings);
        for (const char in node.children) {
            const childNode = node.children[char];
            const childListings = this._collectAllListings(childNode);
            childListings.forEach(id => results.add(id));
        }
        return results;
    }
}

// --- GLOBAL STATE ---
const API_URL = '/api'; // Vercel will route this
let authToken = localStorage.getItem('token');
let allListings = []; // Caches all listings
const eventTrie = new Trie(); // Our Trie instance
let autocompleteListingIds = new Set(); // Stores IDs from Trie search

// --- DOM ELEMENTS ---
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

// Modals
const loginModal = $('#login-modal');
const signupModal = $('#signup-modal');
const sellModal = $('#sell-modal');
const detailsModal = $('#details-modal');
const myListingsModal = $('#my-listings-modal');
const paymentModal = $('#payment-modal');
const contactModal = $('#contact-modal');

// Nav
const loggedInNav = $('#logged-in-nav');
const loggedOutNav = $('#logged-out-nav');
const userEmailNav = $('#user-email-nav');

// Listings
const listingsContainer = $('#listings-container');
const noListings = $('#no-listings');

// Forms
const loginForm = $('#login-form');
const signupForm = $('#signup-form');
const sellForm = $('#sell-form');

// Filters
const searchInput = $('#search-input');
const autocompleteContainer = $('#autocomplete-container');
const filterBtn = $('#filter-btn');
const clearFilterBtn = $('#clear-filter-btn');

// --- MODAL HELPERS ---
function showModal(modal) {
    if (modal) { // Add null check
      modal.style.display = 'flex';
    } else {
        console.error("Attempted to show a non-existent modal");
    }
}

function hideModal(modal) {
     if (modal) { // Add null check
       modal.style.display = 'none';
     } else {
        console.error("Attempted to hide a non-existent modal");
     }
}

// Close modal logic
$$('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
        const modalId = btn.getAttribute('data-modal-id');
        const modalToHide = $('#' + modalId);
        if (modalToHide) {
            hideModal(modalToHide);
        }
    });
});

// Hide payment modal by default - Ensure paymentModal exists before hiding
if (paymentModal) {
    hideModal(paymentModal);
}


// --- UI UPDATES ---
function updateNavUI() {
    if (authToken) {
        if(loggedInNav) loggedInNav.style.display = 'flex';
        if(loggedOutNav) loggedOutNav.style.display = 'none';
        const user = JSON.parse(localStorage.getItem('user'));
        if (userEmailNav && user) userEmailNav.textContent = user.email;
    } else {
        if(loggedInNav) loggedInNav.style.display = 'none';
        if(loggedOutNav) loggedOutNav.style.display = 'flex';
        if (userEmailNav) userEmailNav.textContent = '';
    }
}

function showFakePayment(message, duration = 2000) {
    return new Promise((resolve) => {
        const paymentMessageEl = $('#payment-message');
        if (paymentMessageEl) paymentMessageEl.textContent = message;
        if (paymentModal) showModal(paymentModal);
        setTimeout(() => {
            if (paymentModal) hideModal(paymentModal);
            resolve();
        }, duration);
    });
}

function renderListings(listingsToRender) {
    if (!listingsContainer || !noListings) return; // Add checks

    listingsContainer.innerHTML = '';
    if (!listingsToRender || listingsToRender.length === 0) {
        listingsContainer.style.display = 'none';
        noListings.style.display = 'block';
        return;
    }

    listingsContainer.style.display = 'grid';
    noListings.style.display = 'none';

    listingsToRender.forEach(listing => {
        const card = document.createElement('div');
        card.className = 'listing-card';
        card.setAttribute('data-id', listing._id);

        let priorityBadgeHTML = '';
        if (listing.priority > 1) {
            priorityBadgeHTML = `<span class="listing-badge boosted">BOOSTED</span>`;
        }
        
        card.innerHTML = `
            <div class="listing-card-content">
                ${priorityBadgeHTML}
                <h3 class="listing-title">${listing.eventName || 'N/A'}</h3>
                <p class="listing-city">${listing.city || 'N/A'}</p>
                <p class="listing-price">₹${(listing.price || 0).toLocaleString()}</p>
                <div class="listing-tags">
                    <span class="listing-tag type">${listing.passType || 'N/A'}</span>
                    <span class="listing-tag date">${(listing.availableDates || []).join(', ')}</span>
                </div>
            </div>
        `;
        card.addEventListener('click', () => showListingDetails(listing));
        listingsContainer.appendChild(card);
    });
}

function populateTrie() {
    fetch(`${API_URL}/listings/event-names`)
        .then(res => {
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            return res.json();
        })
        .then(eventMap => {
            eventTrie.root = new TrieNode(); // Clear the trie
            if (Array.isArray(eventMap)) {
                eventMap.forEach(event => {
                    if (event && event.name && Array.isArray(event.ids)) {
                        event.ids.forEach(id => {
                            if (id) { // Ensure ID is valid
                                eventTrie.insert(event.name, id);
                            }
                        });
                    }
                });
            }
        })
        .catch(err => console.error("Error fetching or processing event names for Trie:", err));
}

// --- API CALLS & EVENT HANDLERS ---

// Fetch all listings on load
async function fetchAllListings() {
    try {
        const res = await fetch(`${API_URL}/listings`);
        if (!res.ok) throw new Error(`Failed to fetch listings: ${res.statusText}`);
        allListings = await res.json();
        renderListings(allListings);
        populateTrie();
    } catch (err) {
        console.error("Error fetching listings:", err);
         if (listingsContainer) { // Check if exists
             listingsContainer.innerHTML = `<p class="error-message">Could not load listings. Please try again later.</p>`;
         }
    }
}

// Filter button click
if (filterBtn) {
    filterBtn.addEventListener('click', async () => {
        const city = $('#filter-city')?.value || '';
        const passType = $('#filter-pass-type')?.value || '';
        const date = $('#filter-date')?.value || '';
        const query = searchInput?.value || '';
        
        const params = new URLSearchParams();
        if (city) params.append('city', city);
        if (passType) params.append('passType', passType);
        if (date) params.append('date', date);
        
        if (query && autocompleteListingIds.size > 0) {
            let filtered = allListings.filter(l => autocompleteListingIds.has(l._id));
            if (city) filtered = filtered.filter(l => l.city === city);
            if (passType) filtered = filtered.filter(l => l.passType === passType);
            if (date) filtered = filtered.filter(l => l.availableDates.includes(date));
            renderListings(filtered);
        } else {
            if(query) params.append('q', query); 
            try {
                const res = await fetch(`${API_URL}/listings?${params.toString()}`);
                if (!res.ok) throw new Error(`Filter request failed: ${res.statusText}`);
                const filteredListings = await res.json();
                renderListings(filteredListings);
            } catch (err) {
                console.error("Error fetching filtered listings:", err);
                 alert(`Error applying filters: ${err.message}`);
            }
        }
    });
}

// Clear filter button
if (clearFilterBtn) {
    clearFilterBtn.addEventListener('click', () => {
        const cityFilter = $('#filter-city');
        const passTypeFilter = $('#filter-pass-type');
        const dateFilter = $('#filter-date');

        if(cityFilter) cityFilter.value = '';
        if(passTypeFilter) passTypeFilter.value = '';
        if(dateFilter) dateFilter.value = '';
        if(searchInput) searchInput.value = '';
        if(autocompleteContainer) {
            autocompleteContainer.innerHTML = '';
            autocompleteContainer.classList.add('hidden');
        }
        autocompleteListingIds.clear();
        renderListings(allListings); 
    });
}

// Search Input (Trie Autocomplete)
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        const prefix = e.target.value;
        if (!autocompleteContainer) return; // Add check

        autocompleteContainer.innerHTML = '';
        
        if (prefix.length < 2) {
            autocompleteContainer.classList.add('hidden');
            autocompleteListingIds.clear();
            return;
        }
        
        const listingIds = eventTrie.findListingsByPrefix(prefix);
        if (listingIds.size === 0) {
            autocompleteContainer.classList.add('hidden');
            autocompleteListingIds.clear();
            return;
        }
        
        autocompleteListingIds = listingIds;
        
        const item = document.createElement('div');
        item.className = 'autocomplete-item';
        item.textContent = `${listingIds.size} passes found for "${prefix}"...`;
        item.addEventListener('click', () => {
             if (filterBtn) filterBtn.click(); 
            autocompleteContainer.classList.add('hidden');
        });
        autocompleteContainer.appendChild(item);
        autocompleteContainer.classList.remove('hidden');
    });
}

// Show Listing Details
function showListingDetails(listing) {
    const detailsContent = $('#details-content');
    if (!detailsContent || !listing) return; // Add checks

    detailsContent.innerHTML = `
        <h3 class="details-title">${listing.eventName || 'N/A'}</h3>
        <p class="details-price">₹${(listing.price || 0).toLocaleString()}</p>
        <div class="details-info">
            <p><strong>City:</strong> ${listing.city || 'N/A'}</p>
            <p><strong>Type:</strong> ${listing.passType || 'N/A'}</p>
            <p><strong>Date(s):</strong> ${(listing.availableDates || []).join(', ')}</p>
            <p><strong>Description:</strong> ${listing.description || 'N/A'}</p>
        </div>
        <button id="buy-btn" data-id="${listing._id}" class="btn btn-primary">Pay (Fake) $10 to Get Contact Info</button>
    `;
    if (detailsModal) showModal(detailsModal);
}

// Handle "Buy" (Get Contact) button click
document.addEventListener('click', async (e) => {
    if (e.target && e.target.id === 'buy-btn') {
        if (!authToken) {
            alert("Please login to contact the seller.");
            if (detailsModal) hideModal(detailsModal);
            if (loginModal) showModal(loginModal);
            return;
        }

        const listingId = e.target.getAttribute('data-id');
        if (detailsModal) hideModal(detailsModal);
        await showFakePayment("Processing your (fake) $10 payment...");
        
        try {
            const res = await fetch(`${API_URL}/listings/${listingId}/contact`, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            
            if (!res.ok) {
                const errData = await res.json().catch(() => ({ message: 'Could not get contact info.' }));
                throw new Error(errData.message);
            }
            
            const data = await res.json();
            const contactPhoneEl = $('#contact-phone');
            if (contactPhoneEl) contactPhoneEl.textContent = data.phoneNumber || 'N/A';
            if (contactModal) showModal(contactModal);
            
        } catch (err) {
            console.error("Error getting contact info:", err);
            alert(`Error: ${err.message}`);
        }
    }
});

// Handle Login
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const emailInput = $('#login-email');
        const passwordInput = $('#login-password');
        const errorDiv = $('#login-error');
        
        const email = emailInput?.value || '';
        const password = passwordInput?.value || '';

        if(errorDiv) errorDiv.textContent = '';
        if (!email || !password) {
             if(errorDiv) errorDiv.textContent = "Please enter email and password.";
            return;
        }

        try {
            const res = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.message || "Login failed");
            }
            
            authToken = data.token;
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            
            updateNavUI();
            if (loginModal) hideModal(loginModal);
            loginForm.reset();
            
        } catch (err) {
            console.error("Login Error:", err);
            if(errorDiv) errorDiv.textContent = err.message;
        }
    });
}

// Handle Signup
if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const emailInput = $('#signup-email');
        const passwordInput = $('#signup-password');
        const phoneInput = $('#signup-phone');
        const errorDiv = $('#signup-error');

        const email = emailInput?.value || '';
        const password = passwordInput?.value || '';
        const phoneNumber = phoneInput?.value || '';

        if(errorDiv) errorDiv.textContent = '';
        if (!email || !password || !phoneNumber) {
             if(errorDiv) errorDiv.textContent = "Please fill all fields.";
            return;
        }
        
        try {
            const res = await fetch(`${API_URL}/auth/signup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, phoneNumber })
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.message || "Signup failed");
            }
            
            authToken = data.token;
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            
            updateNavUI();
            if (signupModal) hideModal(signupModal);
            signupForm.reset();

        } catch (err) {
             console.error("Signup Error:", err);
            if(errorDiv) errorDiv.textContent = err.message;
        }
    });
}

// Handle Sell Form Submit
if (sellForm) {
    sellForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const boostCheckbox = $('#sell-boost');
        const errorDiv = $('#sell-error');
        
        const isBoosted = boostCheckbox?.checked || false;
        const cost = isBoosted ? 35 : 25;
        if(errorDiv) errorDiv.textContent = '';

        // Safely access values
        const eventName = $('#sell-event-name')?.value || '';
        const city = $('#sell-city')?.value || '';
        const passType = $('#sell-pass-type')?.value || '';
        const price = parseFloat($('#sell-price')?.value) || 0;
        const sellerPhoneNumber = $('#sell-phone')?.value || '';
        const availableDate = $('#sell-date')?.value || '';
        const description = $('#sell-description')?.value || '';


         if (!eventName || !city || !passType || price <= 0 || !sellerPhoneNumber || !availableDate) {
             if(errorDiv) errorDiv.textContent = "Please fill all required fields correctly.";
            return;
        }

        const listingData = {
            eventName, city, passType, price, sellerPhoneNumber,
            availableDates: [availableDate], // Simplified
            description, isBoosted
        };
        
        if (sellModal) hideModal(sellModal);
        await showFakePayment(`Processing (fake) $${cost} listing fee...`);
        
        try {
            const res = await fetch(`${API_URL}/listings`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify(listingData)
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({ message: 'Failed to create listing.' }));
                throw new Error(errData.message);
            }

            alert("Listing created successfully!");
            sellForm.reset();
            fetchAllListings(); // Refresh listings
            
        } catch (err) {
            console.error("Sell Form Error:", err);
            if(errorDiv) errorDiv.textContent = err.message;
            if (sellModal) showModal(sellModal); // Re-show modal on error
        }
    });
}

// Handle "My Listings" Button
const myListingsBtn = $('#my-listings-nav-btn');
if (myListingsBtn) {
    myListingsBtn.addEventListener('click', async () => {
        if (!authToken) return;
        
        const contentDiv = $('#my-listings-content');
        if (!contentDiv || !myListingsModal) return; // Add check

        contentDiv.innerHTML = '<p>Loading...</p>';
        showModal(myListingsModal);
        
        try {
            const res = await fetch(`${API_URL}/listings/my-listings`, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            if (!res.ok) throw new Error(`Could not fetch listings: ${res.statusText}`);
            
            const myListings = await res.json();
            
            if (!myListings || myListings.length === 0) {
                contentDiv.innerHTML = '<p>You have not created any listings.</p>';
                return;
            }
            
            contentDiv.innerHTML = ''; // Clear loading
            myListings.forEach(l => {
                const listingDiv = document.createElement('div');
                listingDiv.className = `my-listing-item ${l.status === 'sold' ? 'sold' : ''}`;
                listingDiv.innerHTML = `
                    <h4>${l.eventName || 'N/A'}</h4>
                    <p>Price: ₹${l.price || 0} | Status: <span class="status ${l.status === 'sold' ? 'status-sold' : 'status-available'}">${l.status || 'N/A'}</span></p>
                    <p class="details">${l.city || 'N/A'} | ${l.passType || 'N/A'}</p>
                    ${l.priority > 1 ? '<p class="boosted-tag">Boosted</p>' : ''}
                `;
                 contentDiv.appendChild(listingDiv);
            });
            
        } catch(err) {
            console.error("My Listings Error:", err);
            contentDiv.innerHTML = `<p class="error-message">${err.message}</p>`;
        }
    });
}

// --- NAV BUTTONS ---
const loginNavBtn = $('#login-nav-btn');
const signupNavBtn = $('#signup-nav-btn');
const sellPassNavBtn = $('#sell-pass-nav-btn');
const logoutNavBtn = $('#logout-nav-btn');

if(loginNavBtn) loginNavBtn.addEventListener('click', () => { if(loginModal) showModal(loginModal); });
if(signupNavBtn) signupNavBtn.addEventListener('click', () => { if(signupModal) showModal(signupModal); });
if(sellPassNavBtn) sellPassNavBtn.addEventListener('click', () => { if(sellModal) showModal(sellModal); });
if(logoutNavBtn) logoutNavBtn.addEventListener('click', () => {
    authToken = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    updateNavUI();
});

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    updateNavUI();
    fetchAllListings();
});