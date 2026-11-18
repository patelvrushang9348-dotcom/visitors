# AI Log — Visitor Photo Slideshow

This log records AI-assisted changes for the assignment. The project owner should append the actual prompts used, review findings, and results from testing the running application.

## Prompt / task 1 — Returning visitor photo selection
- **Prompt summary:** Extend the supplied visitor slideshow so a returning visitor can select old photos and optionally upload new photos for the TV slideshow.
- **AI change:** Added a visitor profile lookup endpoint using normalized mobile number, aggregated previous photo history, selection of previous photo URLs, merging selected old photos with newly uploaded photos, and passing the selected set to the existing Socket.IO TV event.
- **Review/testing performed:** Node.js syntax checks passed for `server/src/server.js` and the gate page's inline JavaScript. This does not prove the end-to-end behavior; run the manual plan in `TEST_PLAN.md`.
- **Known limitation:** Mobile number matching is not OTP-verified and is demo-grade. Add OTP verification before deployment to a public network.

## Prompt / task 2 — Consent and upload validation
- **Prompt summary:** Ensure visitor consent and basic server-side image validation.
- **AI change:** Added required per-visit display consent, five-file/25 MB upload limits, MIME/extension allowlist, and image signature checks for JPEG, PNG, GIF, and WEBP.
- **Review/testing performed:** Static syntax checks passed. Manually test rejected file types, consent required behavior, and the size/count limits.

## Prompt / task 3 — QR code setup page
- **Prompt summary:** Provide a page to generate the entrance QR code pointing to the check-in page.
- **AI change:** Added `/qr` page with an editable visitor URL and QR code generator. The user must replace localhost with the PC's LAN IP for phone scans on local Wi-Fi.
- **Review/testing performed:** Inline JavaScript syntax check passed. Test scanning the generated code from a phone connected to the same Wi-Fi.

## Mistakes / observations and corrections
- The original check-in created a fresh visitor entry and broadcast only the photos uploaded in that check-in; it did not retrieve a returning visitor's photo history. The revised route retrieves prior photos and sends the selected subset plus new uploads.
- QR links containing `localhost` are not reachable from another device. The QR setup page warns users to use the server PC's LAN IPv4 address.
