// --- DATA STRUCTURES ---

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

    findListingsByPrefix(prefix) {
        let node = this.root;
        for (const char of prefix.toLowerCase()) {
            if (!node.children[char]) {
                return new Set(); // No matches
            }
            node = node.children[char];
        }
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
const API_URL = '/api';
let authToken = localStorage.getItem('token');
let allListings = [];
const eventTrie = new Trie();
let autocompleteListingIds = new Set();

// --- DOM ELEMENTS ---
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

const loginModal = $('#login-modal');
const signupModal = $('#signup-modal');
const sellModal = $('#sell-modal');
const detailsModal = $('#details-modal');
const myListingsModal = $('#my-listings-modal');
const paymentModal = $('#payment-modal');
const contactModal = $('#contact-modal');
const loggedInNav = $('#logged-in-nav');
const loggedOutNav = $('#logged-out-nav');
const userEmailNav = $('#user-email-nav');
const listingsContainer = $('#listings-container');
const noListings = $('#no-listings');
const loginForm = $('#login-form');
const signupForm = $('#signup-form');
const sellForm = $('#sell-form');
const searchInput = $('#search-input');
const autocompleteContainer = $('#autocomplete-container');
const filterBtn = $('#filter-btn');
const clearFilterBtn = $('#clear-filter-btn');
const heroFindBtn = $('#hero-find-btn');
const heroSellBtn = $('#hero-sell-btn');

// --- MODAL HELPERS ---
function showModal(modal) {
    if (modal) modal.style.display = 'flex';
}

function hideModal(modal) {
    if (modal) modal.style.display = 'none';
}

$$('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
        const modalId = btn.getAttribute('data-modal-id');
        hideModal($('#' + modalId));
    });
});

if (paymentModal) hideModal(paymentModal);

// --- UI UPDATES ---
function updateNavUI() {
    if (authToken) {
        if (loggedInNav) loggedInNav.style.display = 'flex';
        if (loggedOutNav) loggedOutNav.style.display = 'none';
        const user = JSON.parse(localStorage.getItem('user'));
        if (userEmailNav && user) userEmailNav.textContent = user.email;
    } else {
        if (loggedInNav) loggedInNav.style.display = 'none';
        if (loggedOutNav) loggedOutNav.style.display = 'flex';
        if (userEmailNav) userEmailNav.textContent = '';
    }
}

function showFakePayment(message, duration = 2000) {
    return new Promise((resolve) => {
        const paymentMessageEl = $('#payment-message');
        if (paymentMessageEl) paymentMessageEl.textContent = message;
        showModal(paymentModal);
        setTimeout(() => {
            hideModal(paymentModal);
            resolve();
        }, duration);
    });
}

function renderListings(listingsToRender) {
    if (!listingsContainer || !noListings) return;
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
        let priorityBadgeHTML = listing.priority > 1 ? `<span class="listing-badge boosted">BOOSTED</span>` : '';
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
            </div>`;
        card.addEventListener('click', () => showListingDetails(listing));
        listingsContainer.appendChild(card);
    });
}

function populateTrie() {
    fetch(`${API_URL}/listings/event-names`)
        .then(res => res.ok ? res.json() : Promise.reject(res))
        .then(eventMap => {
            eventTrie.root = new TrieNode();
            if (Array.isArray(eventMap)) {
                eventMap.forEach(event => {
                    if (event && event.name && Array.isArray(event.ids)) {
                        event.ids.forEach(id => id && eventTrie.insert(event.name, id));
                    }
                });
            }
        })
        .catch(err => console.error("Error populating Trie:", err));
}

// --- API & EVENT HANDLERS ---
async function fetchAllListings() {
    try {
        const res = await fetch(`${API_URL}/listings`);
        if (!res.ok) throw new Error(`Server error: ${res.statusText}`);
        allListings = await res.json();
        renderListings(allListings);
        populateTrie();
    } catch (err) {
        console.error("Error fetching listings:", err);
        if (listingsContainer) listingsContainer.innerHTML = `<p class="error-message">Could not load listings.</p>`;
    }
}

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
        if (query) params.append('q', query);
        try {
            const res = await fetch(`${API_URL}/listings?${params.toString()}`);
            if (!res.ok) throw new Error(`Filter request failed: ${res.statusText}`);
            const filteredListings = await res.json();
            renderListings(filteredListings);
        } catch (err) {
            console.error("Error fetching filtered listings:", err);
            alert(`Error applying filters: ${err.message}`);
        }
    });
}

if (clearFilterBtn) {
    clearFilterBtn.addEventListener('click', () => {
        $('#filter-city').value = '';
        $('#filter-pass-type').value = '';
        $('#filter-date').value = '';
        if (searchInput) searchInput.value = '';
        if (autocompleteContainer) {
            autocompleteContainer.innerHTML = '';
            autocompleteContainer.classList.add('hidden');
        }
        autocompleteListingIds.clear();
        renderListings(allListings);
    });
}

if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        const prefix = e.target.value;
        if (!autocompleteContainer) return;
        autocompleteContainer.innerHTML = '';
        if (prefix.length < 2) {
            autocompleteContainer.classList.add('hidden');
            return;
        }
        const listingIds = eventTrie.findListingsByPrefix(prefix);
        if (listingIds.size === 0) {
            autocompleteContainer.classList.add('hidden');
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

function showListingDetails(listing) {
    const detailsContent = $('#details-content');
    if (!detailsContent || !listing) return;
    detailsContent.innerHTML = `
        <h3 class="details-title">${listing.eventName || 'N/A'}</h3>
        <p class="details-price">₹${(listing.price || 0).toLocaleString()}</p>
        <div class="details-info">
            <p><strong>City:</strong> ${listing.city || 'N/A'}</p>
            <p><strong>Type:</strong> ${listing.passType || 'N/A'}</p>
            <p><strong>Date(s):</strong> ${(listing.availableDates || []).join(', ')}</p>
            <p><strong>Description:</strong> ${listing.description || 'N/A'}</p>
        </div>
        <button id="buy-btn" data-id="${listing._id}" class="btn btn-primary">Pay (Fake) $10 to Get Contact Info</button>`;
    showModal(detailsModal);
}

document.addEventListener('click', async (e) => {
    if (e.target && e.target.id === 'buy-btn') {
        if (!authToken) {
            alert("Please login to contact the seller.");
            hideModal(detailsModal);
            showModal(loginModal);
            return;
        }
        const listingId = e.target.getAttribute('data-id');
        hideModal(detailsModal);
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
            showModal(contactModal);
        } catch (err) {
            alert(`Error: ${err.message}`);
        }
    }
});

if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const errorDiv = $('#login-error');
        if (errorDiv) errorDiv.textContent = '';
        try {
            const res = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: $('#login-email').value, password: $('#login-password').value })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || "Login failed");
            authToken = data.token;
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            updateNavUI();
            hideModal(loginModal);
            loginForm.reset();
        } catch (err) {
            if (errorDiv) errorDiv.textContent = err.message;
        }
    });
}

if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const errorDiv = $('#signup-error');
        if (errorDiv) errorDiv.textContent = '';
        try {
            const res = await fetch(`${API_URL}/auth/signup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: $('#signup-email').value,
                    password: $('#signup-password').value,
                    phoneNumber: $('#signup-phone').value
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || "Signup failed");
            authToken = data.token;
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            updateNavUI();
            hideModal(signupModal);
            signupForm.reset();
        } catch (err) {
            if (errorDiv) errorDiv.textContent = err.message;
        }
    });
}

if (sellForm) {
    sellForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!authToken) {
            alert("Please login before creating a listing.");
            hideModal(sellModal);
            showModal(loginModal);
            return;
        }
        const isBoosted = $('#sell-boost')?.checked || false;
        const cost = isBoosted ? 35 : 25;
        const errorDiv = $('#sell-error');
        if (errorDiv) errorDiv.textContent = '';
        const listingData = {
            eventName: $('#sell-event-name')?.value,
            city: $('#sell-city')?.value,
            passType: $('#sell-pass-type')?.value,
            price: parseFloat($('#sell-price')?.value),
            sellerPhoneNumber: $('#sell-phone')?.value,
            availableDates: [$('#sell-date')?.value],
            description: $('#sell-description')?.value,
            isBoosted
        };
        hideModal(sellModal);
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
            fetchAllListings();
        } catch (err) {
            if (errorDiv) errorDiv.textContent = err.message;
            showModal(sellModal);
        }
    });
}

const myListingsBtn = $('#my-listings-nav-btn');
if (myListingsBtn) {
    myListingsBtn.addEventListener('click', async () => {
        if (!authToken) return;
        const contentDiv = $('#my-listings-content');
        if (!contentDiv) return;
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
            contentDiv.innerHTML = '';
            myListings.forEach(l => {
                const listingDiv = document.createElement('div');
                listingDiv.className = `my-listing-item ${l.status === 'sold' ? 'sold' : ''}`;
                listingDiv.innerHTML = `
                    <h4>${l.eventName || 'N/A'}</h4>
                    <p>Price: ₹${l.price || 0} | Status: <span class="status ${l.status === 'sold' ? 'status-sold' : 'status-available'}">${l.status || 'N/A'}</span></p>
                    <p class="details">${l.city || 'N/A'} | ${l.passType || 'N/A'}</p>
                    ${l.priority > 1 ? '<p class="boosted-tag">Boosted</p>' : ''}`;
                contentDiv.appendChild(listingDiv);
            });
        } catch (err) {
            contentDiv.innerHTML = `<p class="error-message">${err.message}</p>`;
        }
    });
}

// --- NAV & HERO BUTTONS ---
const loginNavBtn = $('#login-nav-btn');
const signupNavBtn = $('#signup-nav-btn');
const sellPassNavBtn = $('#sell-pass-nav-btn');
const logoutNavBtn = $('#logout-nav-btn');
const buyTicketsNavBtn = $('#buy-tickets-nav-btn');

if (loginNavBtn) loginNavBtn.addEventListener('click', () => showModal(loginModal));
if (signupNavBtn) signupNavBtn.addEventListener('click', () => showModal(signupModal));
if (logoutNavBtn) logoutNavBtn.addEventListener('click', () => {
    authToken = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    updateNavUI();
});

function handleSellClick() {
    if (!authToken) {
        alert("Please login or sign up to sell a pass.");
        showModal(loginModal);
    } else {
        showModal(sellModal);
    }
}

if (sellPassNavBtn) sellPassNavBtn.addEventListener('click', handleSellClick);
if (heroSellBtn) heroSellBtn.addEventListener('click', handleSellClick);

function handleBuyClick() {
    const filterSection = $('#filter-section');
    if (filterSection) {
        filterSection.scrollIntoView({ behavior: 'smooth' });
    }
}

if (buyTicketsNavBtn) buyTicketsNavBtn.addEventListener('click', handleBuyClick);
if (heroFindBtn) heroFindBtn.addEventListener('click', handleBuyClick);

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    updateNavUI();
    fetchAllListings();
});