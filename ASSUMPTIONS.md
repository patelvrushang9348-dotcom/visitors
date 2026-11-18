# Assumptions — Visitor Photo Slideshow

1. The entrance QR code opens the public/local visitor check-in web page (`/gate`); it does not embed photos or private visitor information.
2. For this college-demo implementation, a normalized 10-digit mobile number is used to match a returning profile. OTP verification is not implemented; production use should add OTP or another verified identity mechanism.
3. Photos registered by a visitor are retained in their profile photo history. Each check-in chooses which historical photos to show and may add up to five new photos.
4. Previous photos are preselected in the check-in UI for convenience; the visitor can unselect any photo before broadcasting.
5. The TV welcome slideshow uses the project's configured priority duration (default 300 seconds) and then returns to ambient display.
6. A visitor must explicitly consent to public TV display on every check-in. Only photos selected/uploaded for that check-in are broadcast.
7. New uploads are limited to five files and 25 MB per file. The server allows JPG/JPEG, PNG, WEBP, and GIF and checks file signatures as well as upload metadata.
8. The existing local JSON file store is retained to minimize changes to this supplied project. It is suitable for a single-server demo, not concurrent production workloads.
9. Phones and the server PC need access to the same Wi-Fi network for local testing. For access outside the LAN, deploy with HTTPS and a public domain.
10. If a visitor has no previous profile, they enter their name and upload at least one new photo before check-in.
