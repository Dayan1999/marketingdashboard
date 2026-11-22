import { initializeApp, getApps, getApp } from 'firebase/app';
import {
    getFirestore,
    collection,
    doc,
    setDoc,
    addDoc,
    updateDoc,
    deleteDoc,
    onSnapshot,
    query,
    orderBy,
    serverTimestamp
} from 'firebase/firestore';

// Replace with your Firebase Project Configuration from the Firebase Console:
// https://console.firebase.google.com/ -> Project Settings -> General -> Your apps -> Web
export const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCe9sPMaCj2oHssV3DxOrd4AfpOCcjINEk",
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "marketingdb-f5f7e.firebaseapp.com",
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "marketingdb-f5f7e",
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "marketingdb-f5f7e.firebasestorage.app",
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "377076618124",
    appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:377076618124:web:9cd27998498ebbcfaf3ca9",
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-NSDTVFX4MK"
};

// Check if Firebase has been configured with real credentials
export const isFirebaseConfigured = () => {
    return (
        Boolean(firebaseConfig.apiKey) &&
        firebaseConfig.apiKey !== "YOUR_API_KEY" &&
        Boolean(firebaseConfig.projectId) &&
        firebaseConfig.projectId !== "YOUR_PROJECT_ID"
    );
};

// Initialize Firebase App & Firestore safely
export const app = !getApps().length
    ? initializeApp(firebaseConfig)
    : getApp();

export const db = getFirestore(app);

// --- FIRESTORE HELPER SERVICES ---

// Real-time Inquiries Listener
export const subscribeToInquiries = (callback: (inquiries: any[]) => void, onError?: (err: any) => void) => {
    if (!isFirebaseConfigured()) return () => {};
    try {
        const colRef = collection(db, 'inquiries');
        return onSnapshot(colRef, (snapshot) => {
            const items = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            items.sort((a: any, b: any) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
            callback(items);
        }, (err) => {
            console.warn("Firestore inquiries listener error:", err);
            if (onError) onError(err);
        });
    } catch (e) {
        console.warn("Failed to subscribe to inquiries:", e);
        return () => {};
    }
};

// Real-time Users Listener
export const subscribeToUsers = (callback: (users: any[]) => void, onError?: (err: any) => void) => {
    if (!isFirebaseConfigured()) return () => {};
    try {
        const q = collection(db, 'users');
        return onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            callback(items);
        }, (err) => {
            console.warn("Firestore users listener error:", err);
            if (onError) onError(err);
        });
    } catch (e) {
        console.warn("Failed to subscribe to users:", e);
        return () => {};
    }
};

// Save User
export const saveUserToFirestore = async (userData: any) => {
    if (!isFirebaseConfigured()) return userData;
    try {
        const { id, ...data } = userData;
        const ref = doc(db, 'users', id);
        await setDoc(ref, data, { merge: true });
    } catch (err) {
        console.warn("Firestore save user fallback:", err);
    }
    return userData;
};

// Delete User
export const deleteUserFromFirestore = async (id: string) => {
    if (!isFirebaseConfigured()) return;
    try {
        await deleteDoc(doc(db, 'users', id));
    } catch (err) {
        console.warn("Firestore delete user fallback:", err);
    }
};

// Add or Update Inquiry
export const saveInquiryToFirestore = async (inquiryData: any) => {
    if (!isFirebaseConfigured()) return inquiryData;
    try {
        const { id, ...data } = inquiryData;
        if (id) {
            const ref = doc(db, 'inquiries', id);
            await setDoc(ref, { ...data, updatedAt: serverTimestamp() }, { merge: true });
            return { id, ...data };
        } else {
            const ref = await addDoc(collection(db, 'inquiries'), {
                ...data,
                createdAt: serverTimestamp()
            });
            return { id: ref.id, ...data };
        }
    } catch (err) {
        console.warn("Firestore save inquiry fallback:", err);
        return inquiryData;
    }
};

// Delete Inquiry
export const deleteInquiryFromFirestore = async (id: string) => {
    if (!isFirebaseConfigured()) return;
    try {
        await deleteDoc(doc(db, 'inquiries', id));
    } catch (err) {
        console.warn("Firestore delete inquiry fallback:", err);
    }
};

// --- APP CONFIGURATION / EVENT TYPES & PACKAGES ---
export const subscribeToConfig = (callback: (config: any) => void) => {
    if (!isFirebaseConfigured()) return () => {};
    try {
        const ref = doc(db, 'settings', 'app_config');
        return onSnapshot(ref, (snap) => {
            if (snap.exists()) {
                callback(snap.data());
            } else {
                callback(null);
            }
        }, (err) => {
            console.warn("Firestore config listener error:", err);
        });
    } catch (e) {
        console.warn("Failed to subscribe to config:", e);
        return () => {};
    }
};

export const saveConfigToFirestore = async (config: any) => {
    if (!isFirebaseConfigured()) return;
    try {
        const ref = doc(db, 'settings', 'app_config');
        await setDoc(ref, config, { merge: true });
    } catch (err) {
        console.warn("Firestore save config fallback:", err);
    }
};

// --- VISITS HELPER SERVICES ---
export const subscribeToVisits = (callback: (visits: any[]) => void, onError?: (err: any) => void) => {
    if (!isFirebaseConfigured()) return () => {};
    try {
        const colRef = collection(db, 'visits');
        return onSnapshot(colRef, (snapshot) => {
            const items = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            items.sort((a: any, b: any) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
            callback(items);
        }, (err) => {
            console.warn("Firestore visits listener error:", err);
            if (onError) onError(err);
        });
    } catch (e) {
        console.warn("Failed to subscribe to visits:", e);
        return () => {};
    }
};

export const saveVisitToFirestore = async (visitData: any) => {
    if (!isFirebaseConfigured()) return visitData;
    try {
        const { id, ...data } = visitData;
        if (id) {
            const ref = doc(db, 'visits', id);
            await setDoc(ref, { ...data, updatedAt: serverTimestamp() }, { merge: true });
            return { id, ...data };
        } else {
            const ref = await addDoc(collection(db, 'visits'), {
                ...data,
                createdAt: serverTimestamp()
            });
            return { id: ref.id, ...data };
        }
    } catch (err) {
        console.warn("Firestore save visit fallback:", err);
        return visitData;
    }
};

export const deleteVisitFromFirestore = async (id: string) => {
    if (!isFirebaseConfigured()) return;
    try {
        await deleteDoc(doc(db, 'visits', id));
    } catch (err) {
        console.warn("Firestore delete visit fallback:", err);
    }
};

