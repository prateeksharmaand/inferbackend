# PHR Health Application

A comprehensive **Personal Health Record (PHR)** Flutter application with AI-powered insights, OCR document scanning, and real-time health monitoring.

## Tech Stack
- **Mobile**: Flutter (Android + iOS)
- **Backend**: Node.js + Express
- **Database**: PostgreSQL
- **AI**: Claude API (HealthBot), ML Kit (OCR)

## Features

### Mobile App
| Feature | Status |
|---------|--------|
| Medical document upload & OCR (ML Kit) | ✅ |
| Health profile with all sections | ✅ |
| Health timeline | ✅ |
| Document AES-256 encryption | ✅ |
| Search & filter | ✅ |
| BP, Glucose, Weight, Temp, SpO2 input | ✅ |
| Camera-based heart rate detection | ✅ |
| Health dashboards with charts | ✅ |
| Abnormal reading alerts | ✅ |
| HealthBot (Claude AI) | ✅ |
| Drug interaction checker | ✅ |
| Medicine reminders + push notifications | ✅ |

### Backend
- JWT authentication with refresh tokens
- LOINC-coded vital classification
- OCR text analysis → biometric extraction
- Drug interaction checking (OpenFDA + AI)
- FCM push notifications
- Cron-based medicine reminders
- PostgreSQL with full schema

## Quick Start

### Backend
```bash
cd backend
cp .env.example .env
# Edit .env with your credentials
npm install
npm run dev
```

### With Docker
```bash
cp backend/.env.example backend/.env
# Edit .env
docker-compose up -d
```

### Flutter App
```bash
cd flutter_phr
flutter pub get
# Add google-services.json (Android) & GoogleService-Info.plist (iOS)
flutter run
```

## Environment Variables
See `backend/.env.example` for all required variables.

Key variables:
- `ANTHROPIC_API_KEY` - For HealthBot AI responses
- `OPENFDA_API_KEY` - For drug interaction lookup
- `JWT_SECRET` - Change before production!
- Firebase service account for push notifications

## Deployment on Hostinger VPS
```bash
# Install Docker on VPS
curl -fsSL https://get.docker.com | sh

# Clone and configure
git clone <repo>
cd phr-app
cp backend/.env.example backend/.env
nano backend/.env  # Set production values

# Start
docker-compose up -d
```

## Architecture
```
Flutter App → HTTPS → Nginx → Node.js API → PostgreSQL
                                    ↓
                              Firebase FCM → Mobile
                              Claude API (HealthBot)
                              OpenFDA (Drug Interactions)
```

## LOINC Codes Used
| Vital | LOINC Code |
|-------|------------|
| Blood Pressure | 55284-4 |
| Heart Rate | 8867-4 |
| Body Weight | 29463-7 |
| Body Temperature | 8310-5 |
| Oxygen Saturation | 59408-5 |
| Blood Glucose | 15074-8 |
