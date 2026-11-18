# 🏛️ Smart TV Visitor Welcome & Real-Time Sync System (webOS 22)

> **Enterprise Multi-Screen Guest Welcome, Gate QR Check-In, and Automated Slideshow Architecture**  
> Designed for **3x LG Smart TVs running webOS 22** with Centralized Admin & Instant Mobile Gate Check-In.

---

## 📑 Project Documentation Index

Aapke project ke sabhi technical, architectural, setup aur deployment aspects ko detail me cover karne ke liye separate dedicated manuals create kiye gaye hain:

| Document | Topic & Focus Area | Description |
| :--- | :--- | :--- |
| [01_INTRODUCTION_AND_OVERVIEW.md](file:///e:/project/visitor/docs/01_INTRODUCTION_AND_OVERVIEW.md) | **Introduction & Architecture** | Project vision, problem statement, core 4 components, and end-to-end data flow. |
| [02_TECH_STACK_AND_DECISIONS.md](file:///e:/project/visitor/docs/02_TECH_STACK_AND_DECISIONS.md) | **Tech Stack & Architectural Decisions** | Kyun humne Node.js, WebSockets, Flutter MVVM aur webOS HTML5 choose kiya (In-depth justification). |
| [03_LOCAL_SETUP_AND_SIMULATOR_GUIDE.md](file:///e:/project/visitor/docs/03_LOCAL_SETUP_AND_SIMULATOR_GUIDE.md) | **Localhost & Simulator Setup** | Windows machine par backend run karna, webOS TV 22 Simulator me app launch karna, aur live testing. |
| [04_PRODUCTION_DEPLOYMENT_AND_TV_INSTALLATION.md](file:///e:/project/visitor/docs/04_PRODUCTION_DEPLOYMENT_AND_TV_INSTALLATION.md) | **Production Hosting & TV Deployment** | Real project hosting (Cloud/Local Mini PC), SSL HTTPS setup, webOS IPK packaging, and physical TV deployment. |
| [05_USER_ROLES_PERMISSIONS_AND_SECURITY.md](file:///e:/project/visitor/docs/05_USER_ROLES_PERMISSIONS_AND_SECURITY.md) | **Roles, Permissions & Security** | Visitor, Admin, aur TV Displays ke rights, moderation privacy, aur security best practices. |
| [06_API_AND_WEBSOCKET_SPECIFICATION.md](file:///e:/project/visitor/docs/06_API_AND_WEBSOCKET_SPECIFICATION.md) | **API & WebSocket Specifications** | Sabhi REST endpoints, WebSocket event payloads, aur database structure ki complete reference. |

---

## ⚡ Quick Start (Local Run in 60 Seconds)

1. **Start the Central Sync Server:**
   ```bash
   cd e:\project\visitor\server
   npm install
   npm start
   ```
2. **Access Portals:**
   - 📱 **Gate Visitor Check-In:** `http://localhost:5000/gate`
   - 🎛️ **Admin Control Dashboard:** `http://localhost:5000/admin`
   - 📺 **webOS 22 TV Display:** `http://localhost:5000/tv?tvId=tv1`
3. **Launch in webOS 22 Simulator:**
   - Open `webOS_TV_22_Simulator.exe`
   - Click `File -> Launch App` (`Ctrl + A`)
   - Select folder: `E:\project\visitor\tv_display_webos`
## Common household QR flow (updated)

1. Start the server (`cd server && npm install && npm start`).
2. Open `http://localhost:5000/qr` on the server PC.
3. Enter the server base URL. For LAN use the PC IPv4 address, e.g. `http://192.168.1.10:5000` (find it with `ipconfig`).
4. Generate and download/print the **one common QR code** for the residence. Reuse this same QR for every visitor.
5. Visitors scan the QR, select their existing profile from the list, and the page loads that profile's saved photo history. They can choose old photos and optionally upload new ones.
6. Visitor must consent, then the check-in triggers the TV slideshow with only the selected profile's photos.

The profile chooser endpoint (`GET /api/visitor/profiles`) returns names/profile IDs and photo counts. The selected profile is fetched via `GET /api/visitor/profile?profileId=...`; check-in accepts `selectedProfileId`. This is a college/demo flow: profile selection alone is not authentication. Add OTP or another verification method and protect the admin/profile APIs before exposing the system to the public internet, since the directory currently reveals visitor names.


## Common QR Visitor Profile Registration (Updated)

- The residence uses one shared QR code that opens `/gate`. Visitors can scan it with the phone's built-in camera/QR scanner.
- First-time visitors tap **New visitor? Register your profile**, enter their name and 10-digit mobile number, and register. The profile is then selected in the check-in dropdown.
- Returning visitors select their saved profile from the dropdown. The check-in page retrieves that profile's prior photo history.
- First-time visitors register their name and mobile number from the common QR page and upload photos. The registration creates a random device-link token stored in that mobile browser. On later scans of the same common QR from that same browser/device, the server resolves the visitor profile automatically; the gate page does not show a directory of all visitor profiles. If consent was granted during an earlier check-in and saved photos exist, the server automatically broadcasts that visitor’s saved photos to the TVs. Visitors can also select old photos and upload new photos for a manual check-in.
- Admins can manage visitor profiles at `/admin/visitor-profiles.html` (linked from the admin dashboard): create, edit names, refresh listing, and delete profiles.
- Generate/print the one shared QR from `/qr`. Use a LAN address such as `http://<PC-LAN-IP>:5000/gate` for local Wi-Fi demos. Phone native QR scanning opens the URL; mobile photo capture is offered by the file input (`capture=environment`).

**Device recognition note: the shared QR URL is identical for everyone and cannot identify a person by itself. Automatic recognition relies on the browser localStorage device token established during first-time registration. If a visitor changes phones, clears browser storage, or scans using a different browser, the device link is lost and they must register/verify again; OTP recovery is not configured in this demo.

Demo/security notes:** This project stores profile data in local JSON files and uses mobile-number matching without OTP. Admin APIs are not authenticated in this demo. Do not expose it to the public internet without adding administrator authentication, OTP/identity verification, HTTPS, and stricter photo privacy controls. Camera access via mobile web browsers may require HTTPS or browser-specific permission; using the phone's built-in QR scanner for the common QR is the easiest LAN demo flow.
