# 🎓 IELTS Writing Task 1 - Visual Description Tool

An intelligent practice tool for IELTS Writing Task 1 that helps students improve their visual description skills through AI-powered feedback and visualization generation.

## ✨ Features

### 📊 Multiple Task Types
- **Tables** - ASCII table generation from descriptions
- **Line/Polyline Graphs** - Python matplotlib chart generation
- **Bar Charts** - Automated data visualization
- **Pie Charts** - Circular data representation
- **Flowcharts/Process Diagrams** - Step-by-step process visualization
- **Pictures/Maps** - Advanced dual-pipeline generation (PNG → ASCII fallback)

### 🤖 AI-Powered Feedback
- **Quick Help** - Instant writing suggestions while you work
- **Comprehensive Feedback** - Detailed IELTS scoring across all four criteria:
  - 📝 Task Achievement
  - 🔗 Coherence and Cohesion
  - 📚 Lexical Resource
  - ✅ Grammatical Range and Accuracy

### 🗺️ Advanced Map Generation
**Primary Pipeline: DALL-E 3 PNG**
- High-quality image generation with adaptive styling
- Detects content type (natural vs urban) and adjusts visual approach
- 2-minute timeout with Upstash Redis job management
- Isometric 3D rendering for natural landscapes
- Architectural plan view for urban settings

**Fallback Pipeline: ASCII Emoji Maps**
- Instant visualization using text-based emojis
- Clear spatial relationships with grid layout
- Roads rendered as ⬛ (black squares) - Dune 2 style!
- Dark theme display for optimal emoji visibility
- Comprehensive emoji dictionary covering all IELTS map features

### 🎯 Smart Visualization
- Side-by-side comparison with original task image
- Visual validation of description accuracy
- Color-coded feedback sections
- Word count tracking (150-word minimum)

## 🏗️ Architecture

### Frontend
- Pure vanilla JavaScript (no frameworks)
- Responsive design with CSS Grid
- Real-time polling with progress indicators
- GitHub API integration for task image loading

### Backend (Netlify Functions)
- **Serverless**: Netlify Functions with Node.js
- **Job Queue**: Upstash Redis for async processing
- **APIs Used**:
  - OpenAI GPT-4o & GPT-4o-mini (feedback & ASCII generation)
  - OpenAI DALL-E 3 (PNG map generation)
  - E2B Code Interpreter (Python chart execution)
