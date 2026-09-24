# Infer PHR — App Store Connect listing (v1.0)

Paste each block into the matching App Store Connect field. Character limits are checked by `store/check_listing.py`.

---

## App Information

| Field | Value |
|---|---|
| Name (30) | `Infer PHR: Health Records` |
| Subtitle (30) | `Vitals, reports & AI insights` |
| Bundle ID | `com.infer.care` |
| SKU | `infer-phr-ios` |
| Primary category | Medical |
| Secondary category | Health & Fitness |
| Content rights | Does not contain, show or access third-party content |
| Copyright | `2026 <your legal entity name>` |

**Why Medical over Health & Fitness:** the app stores medical records and lab reports. Medical is the more accurate category, and reviewers look closer at mislabelled health apps.

---

## Pricing and Availability

- Price: Free
- Availability: India (add more countries later if needed; ABHA is hidden, so nothing is India-only)

---

## Version 1.0 — Promotional Text (170)

```
Keep every lab report, prescription and vital in one secure place. Import reports straight from Gmail, sync Apple Health, and get clear AI explanations of your results.
```

## Description (4000)

```
Infer PHR is your personal health record: one secure place for your medical reports, prescriptions and vitals, with AI that helps you make sense of them.

ALL YOUR RECORDS IN ONE PLACE
• Upload lab reports, prescriptions, discharge summaries and radiology reports as PDFs or photos
• Photograph paper reports with your camera
• Connect Gmail to automatically import medical reports that hospitals and labs email you
• Filter by document type and tags, and sort by date

UNDERSTAND YOUR REPORTS
• Smart Report turns a lab report into a plain-language summary with key values highlighted
• Abnormal values are flagged so you know what to discuss with your doctor

TRACK YOUR VITALS
• Log blood pressure, blood glucose, heart rate, SpO₂, temperature and weight
• Sync readings from Apple Health, including Apple Watch and connected devices
• Estimate your heart rate by placing a fingertip over the camera
• See trends over time in clear charts
• Get alerts when a reading is outside the normal range

AI HEALTH ASSISTANT
• Ask health questions in everyday language
• Check for interactions between medicines
• Run a symptom self-check and see which health risks to keep an eye on
AI features only work after you allow them, and you can turn them off anytime.

YOUR HEALTH TIMELINE
• Every report, reading and event in one chronological view

PRIVATE BY DESIGN
• Data is encrypted in transit and your login is kept in secure device storage
• No ads and no tracking
• Apple Health data is read-only and never shared
• Delete your account and all your data anytime from the app

Important: Infer PHR is for information and record-keeping only. It is not a medical device and does not provide medical advice, diagnosis or treatment. Camera heart-rate readings are estimates. Always consult a qualified doctor, and in an emergency call 112.

Privacy Policy: https://inferapp.online/privacy.html
Terms of Use: https://inferapp.online/terms.html
```

## Keywords (100)

```
PHR,medical records,lab report,prescription,blood pressure,BP,glucose,sugar,diabetes,vitals,tracker
```

Words already in the name or subtitle ("Infer", "health", "records", "AI") are left out because Apple indexes those anyway. ABHA is left out while that feature is hidden, since guideline 2.3.7 prohibits keywords for features the app doesn't have.

## What's New in This Version (4000)

```
Welcome to Infer PHR! Store your medical reports, track your vitals, import reports from Gmail, sync Apple Health and get AI explanations of your results — all in one private place.
```

## URLs

| Field | Value |
|---|---|
| Support URL | `https://inferapp.online/phr.html` (has support@inferapp.online) |
| Marketing URL | `https://inferapp.online/phr.html` |
| Privacy Policy URL | `https://inferapp.online/privacy.html` |

---

## Age Rating questionnaire

Answer **Medical or Treatment Information: Yes (Infrequent/Mild)**. Answer **None / No** to everything else: violence, sexual content, profanity, drugs, gambling, horror, contests, user-generated content shared with others, unrestricted web access and messaging with other users.

Also set **"Age Assurance / minimum age"** to 18+ if it's offered, to match the Terms of Use.

---

## App Privacy ("nutrition label")

**Tracking:** No. None of the data is used to track users.

Collected, **linked to the user**, purpose **App Functionality** only:

| Category | Data type | Why |
|---|---|---|
| Contact Info | Name | Account |
| Contact Info | Email Address | Account/login |
| Contact Info | Phone Number | Profile |
| Health & Fitness | Health | Vitals, conditions, allergies, reports, AI analysis |
| Health & Fitness | Fitness | Steps and active energy from Apple Health |
| User Content | Emails or Text Messages | Medical-report emails imported via Gmail |
| User Content | Other User Content | Uploaded documents and photos, AI chat messages |
| Identifiers | User ID | Account ID |

Not collected: location, contacts, browsing/search history, purchases, financial info, diagnostics, advertising data.

This matches `ios/Runner/PrivacyInfo.xcprivacy`.

---

## App Review Information

**Sign-in required:** Yes. Provide a demo account:

- Username: `appreview@inferapp.online` (create it and add sample data first: 3–4 lab reports, a week of BP and glucose readings)
- Password: `<set a strong password>`

**Contact:** your name, phone and email.

**Notes (4000):**

```
Infer PHR is a personal health record app. Users store medical documents, log vitals and get AI explanations of their data. It is not a medical device and does not diagnose or treat; disclaimers appear on all AI screens.

DEMO ACCOUNT
The demo account above already has sample lab reports and vitals.

AI FEATURES
AI features (health chat, drug interaction checker, risk assessment, symptom self-check, lab report summaries) use third-party AI services through our server: Google's Gemini API (chat, drug checker, risk assessment, lab report summaries) and Groq (symptom self-check). Following guideline 5.1.2(i), the app asks for explicit permission before any data is sent to the AI provider. The prompt appears on the Home screen after sign-in and can be changed anytime in Profile → AI Health Insights. If declined, AI screens stay locked and the rest of the app works normally. In addition, every document upload (and every re-analysis) asks separately whether that specific document may be sent for AI analysis; choosing "Upload without AI" saves it without sending it to the AI provider.

APPLE HEALTH
Read-only. Vitals → sync icon → Sync Now imports heart rate, blood pressure, glucose, weight, SpO2, temperature, steps and active energy. We never write to Apple Health and never share HealthKit data.

CAMERA HEART RATE
Vitals → camera icon. The user places a fingertip over the rear camera and the app estimates heart rate from colour changes. Frames are processed on-device and never uploaded. The screen states that the result is an estimate for personal tracking, not a medical measurement.

GMAIL IMPORT
Optional. Records → Connect Gmail opens Google sign-in in the browser (read-only Gmail scope). The app checks the sender and subject of recent emails that have attachments, and imports only PDF/image attachments from emails that look like medical reports (labs, hospitals, prescriptions). Imported reports are sent for AI analysis only if the user has allowed AI features. Users can disconnect in the app.

ACCOUNT DELETION
Profile → Delete Account → enter password. This permanently deletes the account and all health data.
```

---

## Screenshots

Required: **6.9" iPhone (1320 × 2868)**. Apple scales these down for smaller iPhones. The app is iPhone-only, so no iPad screenshots are needed.

Capture them from the iPhone 18 Pro Max simulator, signed in to the demo account:

| # | Screen | Caption |
|---|---|---|
| 1 | Home dashboard | All your health in one place |
| 2 | Records list | Every report, always with you |
| 3 | Smart Report | Understand your lab results |
| 4 | Vitals trends | Track BP, sugar & more |
| 5 | Apple Health sync sheet | Syncs with Apple Health |
| 6 | AI Health Assistant chat | Ask AI about your health |
| 7 | Timeline | Your complete health story |
| 8 | Profile (Delete Account visible) | Private. No ads. Your data. |
