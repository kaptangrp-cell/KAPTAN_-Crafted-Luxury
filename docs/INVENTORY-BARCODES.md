# Inventory barcode guide

1. Open **Admin → Inventory → Stock & labels**. Every catalogue product appears here, including inactive products and products without options.
2. For a new product, choose **Set up tracking**. Check the opening-count notice: enabling tracking replaces manually entered availability with counted units. Add colour/size options under Products first if needed. A product without options receives a One size option. For an already tracked product with no options, choose **Generate barcodes → Create one-size option**.
3. Choose the product option, quantity and storage location, then generate labels. Print at **100% / actual size**. Labels measure **76 × 51 mm** on a two-column A4 sheet.
4. Attach one label to each physical unit. Receive the units using the scanner, or the delivery batch receipt flow, to make them available for sale. Generating a label alone does not add available stock.
5. Use **Reprint labels** for an existing batch. Do not generate a new batch merely to reprint.

## Numbering

`KP-BSL-PK-OS-0001` means KAPTAN / Ball Salt Lamp / Pink / One size / unit 1.
Each product starts at 0001 and shares a sequence across its colour/size variants. Subsequent batches continue from the last number. Numbers are never reused after deleting an unused label. Reprints and product renames preserve the original identity. Numbers expand beyond 9999 without truncation.

Known product names use short brand codes. Other names receive an automatic unique prefix. Colour comes from the selected variant; NA means no recognised colour has been specified. Choose the correct colour/size variant before generating labels.

Code 128 is intended for internal stock tracking, not as a registered retail EAN/GTIN. USB/Bluetooth scanners operating as a keyboard can scan into the unit-number field and send Enter. The camera reader supports Code 128 and also accepts previous QR labels. Camera reliability depends on focus, lighting and device support. Existing unit numbers and inventory history are preserved.

## Release

Apply `supabase/migrations/20261118100000_inventory_barcodes.sql` before deploying the application update. It changes future unit allocation, adds a protected per-product counter and an admin-only action to restore an absent One size option. It does not create stock, reset availability or renumber existing units.
