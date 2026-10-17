# Multi-shop POS and Marketplace

A multi-shop point-of-sale and marketplace starter built with Express, MongoDB, and separate browser pages for sign-in, shop management, platform administration, and the customer marketplace.

## Project layout

```text
public/
  index.html            Landing page
  login.html            Shop registration and sign-in
  shop.html             Private POS, inventory, sales, and reports
  admin.html            Platform administrator portal
  marketplace.html      Public shop/product marketplace
  css/styles.css
  js/                   Browser-side page modules
src/
  config/               MongoDB connection
  middleware/           Session and role checks
  models/               Shop, product, and invoice models
  routes/                Authentication, shop, admin, marketplace APIs
  services/              Platform administrator provisioning
server.js
```

## Run locally or with MongoDB Atlas

1. Install Node.js 20 or newer, then run `npm install`.
2. Create a MongoDB database. For a hosted site, create a MongoDB Atlas cluster, a database user, and allow access from your app host's IP address. Copy the application's connection string from Atlas.
3. Copy `.env.example` to a new, untracked `.env` file and set:
   - `MONGODB_URI` to your local MongoDB URL or Atlas connection string, including the database name.
   - `JWT_SECRET` to a long, unique random secret.
   - `ADMIN_EMAIL` and `ADMIN_PASSWORD` to your platform-administrator login. Use a unique password with at least 10 characters.
4. Run `npm run dev` and open `http://localhost:3000`. Use `npm start` on a production host.

The first server start creates the platform administrator from the environment variables. Keep `.env` private and do not commit it. Shops get immediate portal access when registration succeeds. The platform administrator can suspend access when subscription payment becomes overdue and restore access after resolving it.

For a hosted launch, deploy this Node.js application to a Node-compatible hosting service, set the same environment variables in that service's private environment-variable settings, and point it to the Atlas database. Turn on HTTPS and set `NODE_ENV=production` so browser login cookies are secure. Never put the MongoDB URI, admin password, or JWT secret in the public browser files or send them in chat.

### Deploy on Vercel

Import the Git repository into Vercel with the project root set to this repository. The included `vercel.json` routes requests through the Express app exported from `server.js`, which serves the files in `public/` and handles the API endpoints. In the Vercel project settings, add `MONGODB_URI`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `NODE_ENV=production` for the Production environment (add them to Preview too if previews need to connect to the database). Ensure MongoDB Atlas allows connections from Vercel, then redeploy. Do not add `.env` to Git or paste secrets into source files.

## Pages

- `/` — landing page
- `/login.html` — shop registration/sign-in
- `/shop.html` — shop POS and inventory portal
- `/admin.html` — platform account controls
- `/marketplace.html` — customer-facing product listing and details

The marketplace only shows active shops whose marketplace is enabled, and it reads current product stock from MongoDB. Selecting an available item opens its details, shop contact, and stock. The order form opens WhatsApp with the item and customer details prefilled; the customer reviews and sends the message. WhatsApp does not send the message automatically from a normal website link. Fully automatic sending requires separate Meta WhatsApp Business Cloud API onboarding and approved credentials.

In the shop portal, use **New Bill** to search inventory, build a cart, adjust quantities, complete a multi-item sale, and open or print its receipt. The dashboard shows today's and this month's bill counts and income, plus low-stock products. **Invoices** includes date-filtered records with view/print/delete actions and CSV export; **Reports** shows sales totals and product sales summaries. Product management supports adding/editing stock, hiding products from the marketplace, and uploading a PNG, JPG, or WebP product image (up to 2 MB) from the computer, as well as using an image URL. Uploaded images are stored with product data in MongoDB. Customer WhatsApp messages are order requests; staff should confirm the order and stock with the customer.

## Hosting

Deploy the Node server to a host that supports persistent Node.js processes and configure the environment variables there. Use MongoDB Atlas (or another hosted MongoDB service) for the database. Configure the host's HTTPS URL and restrict database network access to the hosting provider. Do not put MongoDB credentials or the JWT secret in browser code.

Subscription access is controlled by the administrator, not an automatic payment-gateway integration. New shops can use the portal immediately; an administrator can suspend an unpaid shop, which blocks its next authenticated request and clears its browser session on the next request. Shop product and invoice APIs scope every read and write to the authenticated shop. The platform administrator can hide a shop from the marketplace or delete a shop and its associated inventory and invoice records.
