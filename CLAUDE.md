# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CKA (Certified Kubernetes Administrator) exam preparation exercises, based on CKA Curriculum v1.35. Exercises are sourced from [chadmcrowell/CKA-Exercises](https://github.com/chadmcrowell/CKA-Exercises), reorganized by exam curriculum structure and annotated with kubernetes.io documentation links.

This is a documentation-only repository (Markdown files). There is no build system, test suite, or application code.

## Repository Structure

- `exercises/` — Exercises organized by CKA exam domain (5 files, one per domain)
- `dist/` — Gitignored. Contains the original source exercises and a docs-mapping reference
- `dist/origin/CKA-Exercises/` — Upstream exercises from chadmcrowell/CKA-Exercises
- `dist/cluster-architecture-docs-mapping.md` — Mapping of exercises to kubernetes.io docs
- `dist/test/` — Test artifacts (certs, YAML manifests) from working through exercises

## Exercise File Format

Each exercise file in `exercises/` follows this structure:
- H1 heading with domain name and exam weight percentage
- Curriculum reference link to cncf/curriculum
- "Key points" or exam topic list for the domain
- Sections (H2) for each curriculum sub-topic, with a docs bookmark block (📖)
- Individual exercises (H3) each with:
  - A docs link (🔗) to the specific kubernetes.io page
  - A collapsible `<details><summary>show</summary>` block containing the solution
- Some exercises are placeholders with Chinese text noting exercises are yet to be added

## Content Conventions

- Bilingual: Exercise titles and solution code are in English; some structural notes are in Chinese
- Documentation links use two emoji prefixes: 📖 for section-level docs, 🔗 for exercise-level docs
- Solutions are wrapped in `<details><summary>show</summary>` HTML blocks
- Exercises that were misplaced in the original source have been moved to their correct curriculum domain (noted in networking.md and storage.md)

## When Adding or Editing Exercises

- Follow the existing H3 format: exercise title, docs link with 🔗, solution in `<details>` block
- Always include a link to the relevant kubernetes.io documentation page
- Place exercises under the correct curriculum sub-topic section
- Use `kubectl` in solutions; include the `k` alias shorthand where appropriate
- Keep solutions practical and exam-focused (command-line oriented)
