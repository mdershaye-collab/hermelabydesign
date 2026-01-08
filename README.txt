# HermelabyDesign – Free Website (No Shopify)

This is a **static website** (HTML/CSS/JS). It costs **$0** to host on GitHub Pages, Netlify, or Cloudflare Pages.

## What it does
- Shows your Etsy products as a clean catalogue
- Product images + titles are pulled from Etsy automatically via **Etsy oEmbed**
- “Buy on Etsy” takes customers to Etsy checkout (so you don’t need payment processing on this site)
- Includes a “Custom Orders” request form

## Deploy (GitHub Pages – free)
1. Create a GitHub account (if you don’t have one)
2. Create a new repository (public) called: `hermelabydesign-site`
3. Upload **all files** from this folder into the repo (keep the folder structure)
4. In GitHub: Settings → Pages
5. Source: Deploy from a branch
6. Branch: `main` and folder: `/ (root)`
7. Save → your website link will appear there

## Edit products later
Open `data/products.json` and add/remove items (Etsy listing IDs).
Example listing URL format:
https://www.etsy.com/listing/1890018855

Your Etsy shop:
https://www.etsy.com/shop/HermelabyDesign
