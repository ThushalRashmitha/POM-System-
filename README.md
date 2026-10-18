# Multi-shop POS and Marketplace

A multi-shop point-of-sale and marketplace built with Express and Firebase Cloud Firestore. The server uses the Firebase Admin SDK to access Firestore; browser pages call the app's authenticated Express API and never receive service-account credentials.

## Project layout

```text
public/
  index.html            Landing page
  login.html            Shop registration and sign-in
  shop.html             Private POS, inventory, sales, and reports
  admin.html            Platform administrator portal
  marketplace.html      Customer-facing product listing and details
  css/
  js/
src/
  config/                Firebase Admin and Firestore connection
  middleware/            Session and role checks
  models/                Firestore user, product, and invoice access
  routes/                Authentication, shop, admin, marketplace APIs
  services/              Platform administrator provisioning
server.js
```

## Create and configure Firebase

1. Create a Firebase project in the Firebase console.
2. Create a **Cloud Firestore** database in that project.
3. In Project settings → Service accounts, create a private service-account key. Keep the downloaded JSON private; never commit it or send it in chat.
4. Copy `.env.example` to `.env`. Fill in the Firebase project ID, the service-account `client_email`, and `private_key`. In `.env`, retain the private key's `\n` sequences inside quotes; the server turns them into line breaks.
5. Set `JWT_SECRET` to a long random secret and set `ADMIN_EMAIL` and a unique `ADMIN_PASSWORD` (at least 10 characters).
6. Run `npm install`, then `npm run dev` and open `http://localhost:3000`.

The server creates the platform administrator in the Firestore `users` collection on first start. It also uses a `userEmails` collection to enforce unique account emails. Products and invoices are stored in `products` and `invoices`. The Firestore Admin SDK runs only on the server and bypasses Firestore client security rules; do not expose its service-account key to browser code.

Product image URLs can point to an existing HTTP(S) image. To keep uploaded images up to 2 MB without exceeding Firestore's document-size limit, enable Firebase Storage, set `FIREBASE_STORAGE_BUCKET` to the bucket name, and grant the service account permission to create and delete Storage objects. Image uploads need Storage; shops can still use image URLs if Storage is not configured.

## Deploy on Vercel

Import this repository into Vercel with the project root set to the repository root. The included `vercel.json` routes requests to the Express app. In the Vercel project's **Settings → Environment Variables**, add these for **Production** (and Preview if needed):

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `FIREBASE_STORAGE_BUCKET` (only required for product image uploads)
- `JWT_SECRET`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `NODE_ENV` set to `production`

Copy the Firebase values from the private service-account JSON: `project_id`, `client_email`, and `private_key`. Preserve newlines in the private-key value (or use `\n` sequences). For uploads, also set the Storage bucket name shown in Firebase Storage settings (often `<project-id>.firebasestorage.app`). Never add the service-account JSON, its key, or `.env` to Git. Redeploy after changing environment variables.

## Data migration note

Changing the app from MongoDB to Firestore does **not** copy existing records. This app now starts with a fresh Firestore database; existing MongoDB users, products, invoices, and hashed passwords remain in MongoDB unless separately exported and imported. Do not delete the old database until you have confirmed whether it contains data you need.

## Pages and features

- `/` — landing page
- `/login.html` — shop registration/sign-in
- `/shop.html` — private shop POS and inventory portal
- `/admin.html` — platform administration
- `/marketplace.html` — public product marketplace

The marketplace lists products from active shops with marketplace visibility enabled. Orders are sent as prefilled WhatsApp messages for the customer to review; a regular website link cannot send them automatically. Inventory, invoices, dashboard metrics, and reports are persisted in Firestore.

Subscription access is controlled by the platform administrator. Shop APIs scope inventory and invoice access to the authenticated shop. The administrator can suspend a shop, hide it from the marketplace, or delete its account and associated Firestore products and invoices.

## Security

The server continues to use bcrypt password hashes and signed HTTP-only session cookies. Keep all Firebase credentials, the JWT secret, and admin password in private environment variables. If a service-account key was exposed, revoke it in Google Cloud IAM and create a replacement immediately.
