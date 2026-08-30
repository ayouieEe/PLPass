# PLPass Project Structure

This document outlines the directory structure and main components of the PLPass repository, reflecting the latest organization of the ML, API, frontend, and backend components.

## Root Directory

- `api/`: Python-based backend API for ML model serving and backend services.
- `ml/`: Machine Learning pipelines, data processing, model training scripts, and interpretability generation.
- `src/`: React frontend source code.
- `supabase/`: Supabase configuration, Edge Functions, and database migrations.
- `public/`: Static assets for the frontend.
- `docs/`: Documentation files (e.g., deployment runbooks, checklists).
- `e2e/`, `e2e-supabase/`, `tests/`: Automated test directories.
- `scripts/`: Utility scripts.
- `dist/`: Compiled production build for the frontend (generated).

---

## API (`api/`)

The API directory handles model serving and integrations with backend services.

- `main.py`: Entry point for the Python API application.
- `requirements.txt`: Python dependencies for the API.
- `models/`: Directory storing serialized machine learning models and interpretability insights.
  - `attendance_model.pkl` (Generated): The trained and serialized attendance prediction model.
  - `model_insights.json` (Generated): Model interpretability metrics including Permutation Importance and Partial Dependence insights.
- `services/`: Core logic and integration services.
  - `supabase_client.py`: Supabase connection setup and operations.

---

## Machine Learning (`ml/`)

Contains scripts for data assembly, feature engineering, and model training.

- `data/`: Directory for storing raw and processed datasets (typically ignored in git).
- `feature_assembly.py`: Script to process and assemble student and event features.
- `train_attendance_model.py`: Script to train the attendance prediction model, compute interpretability metrics (Permutation Importance, Partial Dependence), and export both the model and `model_insights.json`.
- `PLPass_Event_Features.xlsx`, `PLPass_Student_Features.xlsx`: Source feature datasets.

---

## Frontend (`src/`)

React frontend application built with Vite, TypeScript, and TailwindCSS.

- `app/`: Global application configurations.
- `components/`: Reusable UI components.
- `features/`: Feature-specific logic and UI modules.
- `hooks/`: Custom React hooks.
- `lib/`: Utility functions and library wrappers.
- `pages/`: Main application pages and routes.
- `services/`: Frontend API and service integrations.
- `test-support/`: Testing utilities for the frontend.
- `types/`: TypeScript type definitions.
- `index.css`: Global styles including TailwindCSS imports.
- `main.tsx`: React entry point.

---

## Supabase (`supabase/`)

Supabase configurations and database definitions.

- `config.toml`: Supabase project configuration.
- `migrations/`: SQL migration files defining the database schema.
- `functions/`: Supabase Edge Functions.
- `seed_student_test_data.sql`: Script to populate test data for local development.

---

## Root Level Documentation and Configuration

- `PHASE_*.md`, `FLOWS.md`, `IMPLEMENTATION_SUMMARY.md`: Various phase planning and tracking documents.
- `package.json`, `package-lock.json`: Node.js dependencies and scripts.
- `vite.config.ts`, `tailwind.config.ts`, `postcss.config.js`: Frontend build and styling configurations.
- `playwright.config.ts`, `playwright.supabase.config.ts`: End-to-end testing configurations.
- `eslint.config.js`: Linter configuration.
- `tsconfig.*.json`: TypeScript configurations.
