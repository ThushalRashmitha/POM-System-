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
5. Set `JWT_SECRET` to a long random secret, set `ADMIN_EMAIL` and a unique `ADMIN_PASSWORD` (at least 10 characters). Optionally set `ADMIN_ACCESS_CODE` as a private master fallback; otherwise, create individual codes in the Firestore `invite_codes` collection.
6. Run `npm install`, then `npm run dev` and open `http://localhost:3000`.

The server creates the platform administrator in the Firestore `users` collection on first start. It also uses a `userEmails` collection to enforce unique account emails. Products, invoices, and registration invite codes are stored in `products`, `invoices`, and `invite_codes`. The Firestore Admin SDK runs only on the server and bypasses Firestore client security rules; do not expose its service-account key to browser code.

Products can have as many images as the Firestore product document supports. Shops can enter HTTP(S) image URLs (one per line), upload PNG, JPG, or WebP images directly to Cloudinary, or use both; images are optional, and the marketplace displays the first photo on product cards with a gallery in product details. Existing single-image product records remain supported. Cloudinary upload and Firestore document-size limits still apply. Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` from your Cloudinary dashboard to enable uploads; shops can still use existing HTTP(S) image URLs.

## Deploy on Vercel

Import this repository into Vercel with the project root set to the repository root. The included `vercel.json` routes requests to the Express app. In the Vercel project's **Settings → Environment Variables**, add these for **Production** (and Preview if needed):

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `CLOUDINARY_CLOUD_NAME` (required for product image uploads)
- `CLOUDINARY_API_KEY` (required for product image uploads)
- `CLOUDINARY_API_SECRET` (required for product image uploads)
- `JWT_SECRET`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `ADMIN_ACCESS_CODE` (optional master fallback if a code is not found in Firestore; keep private)
- `NODE_ENV` set to `production`

Copy the Firebase values from the private service-account JSON: `project_id`, `client_email`, and `private_key`. Preserve newlines in the private-key value (or use `\n` sequences). Copy the Cloudinary credentials from your Cloudinary dashboard. Never add the service-account JSON, its key, Cloudinary API secret, or `.env` to Git. Redeploy after changing environment variables.

Shop registration first checks the Firestore `invite_codes` collection for a matching document with `isUsed: false`. Successful registration marks that code as used and records `usedBy` atomically with creating the account. The optional `ADMIN_ACCESS_CODE` master fallback is accepted only when no Firestore document exists for the submitted code. Invalid or already-used codes are rejected before an account is created.

To create an individual invite code, run `npm run invite:create` (optionally provide an assignee label, for example `npm run invite:create -- "Customer name"`). The generated code is printed once and stored in `invite_codes` with `isUsed: false`, an optional `assignedTo`, and a Firestore timestamp in `createdAt`. Share the generated code securely with its intended customer.

## Data migration note

Changing the app from MongoDB to Firestore does **not** copy existing records. This app now starts with a fresh Firestore database; existing MongoDB users, products, invoices, and hashed passwords remain in MongoDB unless separately exported and imported. Do not delete the old database until you have confirmed whether it contains data you need.

## Pages and features

- `/` — landing page
- `/login.html` — shop registration/sign-in
- `/shop.html` — private shop POS and inventory portal
- `/admin.html` — platform administration
- `/marketplace.html` — public product marketplace

The public marketplace lists products from active shops with marketplace visibility enabled. Each shop's **View marketplace** link includes its shop ID (`/marketplace.html?shop=<shop-id>`), and the **Share link** button opens the phone's share sheet or copies the link, so customers opening it see only that shop's available products. The landing page, sign-in page, and marketplace are public; shop and admin pages require the corresponding signed-in account, and unknown page URLs redirect to sign-in. Signed-in shop accounts see only their own available products in the marketplace; the server filters the Firestore `products` query by the authenticated user's shop ID. Product detail requests enforce the same shop scope. Products are stored in the top-level `products` collection with a `shop` field containing the owning user's Firestore document ID. Orders are sent as prefilled WhatsApp messages for the customer to review; a regular website link cannot send them automatically. Inventory, invoices, dashboard metrics, and reports are persisted in Firestore.

Subscription access is controlled by the platform administrator. Shop APIs scope inventory and invoice access to the authenticated shop. The administrator can suspend a shop, hide it from the marketplace, or delete its account and associated Firestore products and invoices.

## Security

The server continues to use bcrypt password hashes and signed HTTP-only session cookies. Keep all Firebase credentials, the JWT secret, and admin password in private environment variables. If a service-account key was exposed, revoke it in Google Cloud IAM and create a replacement immediately.
