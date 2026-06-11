# Sales Copilot Mobile

A mobile CRM agent application for sales professionals, featuring glassmorphism design and voice-driven interactions for managing customers, opportunities, and activities.

## Target Users

- Field sales representatives
- Sales managers

## Screen Structure

### HomeDashboard (Home)
- Greeting header: gradient avatar + greeting + username
- KPI grid (2×2): Today's visits, Active opportunities, Monthly performance, Customers to follow up
- Today's briefing card: orange gradient + play button
- Quick action row: New visit, Ask Copilot, View opportunities, Scan business card
- Summary row: real-time calculation of follow-ups and closing opportunities

### BriefMe (Daily Briefing)
- Section list + playback controller

### CopilotChat (AI Assistant)
- Chat bubble interface + bottom voice button

### ActivityCapture (New Activity)
- Activity type selection + voice notes

### OpportunityReview (Opportunity Review)
- Pipeline summary + opportunity list cards

## Design Specifications

- **Background**: `linear-gradient(180deg, #0F1424 0%, #161B2C 100%)`
- **Primary color**: Orange `#FF7A00`
- **Accent color**: Cyan `#0D8F8C`
- **Cards**: `rgba(255,255,255,0.06)` + `border 1px rgba(255,255,255,0.10)` + border-radius `12px`
- **Font sizes**: Title 14pt/600, Body 11pt, Caption 9.5pt
- **Bilingual support**: zh-Hans / en-US

## Interaction Patterns

- **Top bar**: Left ≡/←, Center page name, Right ⋯/⚙
- **Bottom microphone**: 56px orange circle, press and hold ≥300ms to record
- **Voice-first input**: All input is completed via voice

## Data Model

- **Account**: Customer accounts (ownerid, lastcontactedon, etc.)
- **Opportunity**: Sales opportunities (stageKey, confidence, totalamount)
- **Activity**: Sales activities (typeKey, draftstatusKey, scheduleddate)
- **Contact**: Contacts

## Key Features

- **Global Copilot**: AI assistant overlay accessible from all screens when enabled in settings
- **Voice-first design**: Microphone-driven interactions throughout the app
- **Insight carousel**: Swipeable cards showing AI-generated insights
- **Glassmorphism UI**: Semi-transparent cards with blur effects and gradient backgrounds
