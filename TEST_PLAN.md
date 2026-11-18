# Manual Test Plan — Visitor Photo Slideshow

The following test cases are to be executed against a running local server. Record the actual result/date before submission.

| ID | Scenario | Expected result | Result (fill after run) |
|---|---|---|---|
| TC-01 | Open `/gate` from phone on same Wi-Fi | Check-in form loads | Not run |
| TC-02 | Enter new mobile number and name; upload one valid image; consent and submit | New visitor record saved and selected photo sent to TV | Not run |
| TC-03 | After first successful registration/check-in, scan common QR again in same phone/browser | Device token resolves profile; no visitor directory appears; with saved consent/photos, TV auto-broadcasts the specific profile photos | Not run |
| TC-04 | Returning recognized visitor chooses old photos and uploads one new photo | TV receives only selected old photo(s) and new photo; new photo is appended to profile history | Not run |
| TC-05 | Submit without consent | Request is blocked; TV does not broadcast | Not run |
| TC-06 | Submit with no selected old photos and no new uploads | Request is rejected with clear message | Not run |
| TC-07 | Upload a non-image file renamed to `.jpg` | Server rejects it after signature check | Not run |
| TC-08 | Upload more than five files or a file over 25 MB | Server rejects the upload | Not run |
| TC-09 | Generate common QR on `/qr` with LAN URL and scan using phone | Phone opens gate page; first scan registration, subsequent scans on same browser recognize that device | Not run |
| TC-10 | Wait until configured welcome duration ends | TV returns to ambient slideshow | Not run |

| TC-11 | Scan common QR from a different phone/browser | Device is not auto-recognized; no global visitor profile directory is displayed | Not run |
