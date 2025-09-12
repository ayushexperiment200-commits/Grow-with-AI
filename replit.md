# Grow With AI - Newsletter Generator

## Overview
This is a full-stack AI-powered newsletter generator built with React (frontend) and Express (backend) using Google's Gemini API. The application allows users to generate professional newsletters from trending news articles with AI assistance.

## Recent Changes (Sep 12, 2025)
- ✅ Configured for Replit environment
- ✅ Fixed Vite configuration for proper host binding (0.0.0.0:5000) and proxy setup
- ✅ Removed security vulnerability (GEMINI_API_KEY exposure in client bundle)
- ✅ Updated backend server to bind to 0.0.0.0:5174 for deployment compatibility
- ✅ Fixed HTML/CSS issues (charset, @import ordering, removed broken CSS link)
- ✅ Set up development workflow with npm run dev
- ✅ Configured deployment for VM target

## Project Architecture
- **Frontend**: React + Vite + TailwindCSS (port 5000)
- **Backend**: Express + TypeScript (port 5174)
- **AI Integration**: Google Gemini API for news fetching and newsletter generation
- **Development**: Concurrently runs both client and server
- **Deployment**: VM target with npm run dev

## User Preferences
- Modern, holographic UI design with cyan/blue theme
- Professional newsletter generation with customizable tone and format
- AI-powered content creation with image generation capabilities

## Configuration
- Frontend serves on 0.0.0.0:5000 with allowedHosts: true for Replit proxy
- Backend API on 0.0.0.0:5174 with /api/* routes
- Vite proxies /api/* requests to backend server
- Environment variable GEMINI_API_KEY required for AI features (server-side only)

## Key Features
- Topic-based news research
- AI newsletter generation with customizable parameters
- Header image generation
- Newsletter refinement with natural language prompts
- Export capabilities for professional use