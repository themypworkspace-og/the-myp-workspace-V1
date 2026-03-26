# Contributing to The MYP Workspace™

Thank you for your interest in contributing to **The MYP Workspace™**! This project is a specialized simulation environment designed to help IB students transition from paper-based practice to digital e-Assessments. 

To maintain the high standards of the International Baccalaureate community and ensure the technical stability of our Windows and Web builds, please follow these detailed guidelines.

---

## 🛡️ Our Philosophy on Contributions
The MYP Workspace™ is a "Controlled Open Source" project. While we welcome suggestions, the project lead (**Yogen Jayesh Patel**) maintains final approval over all code to ensure:
1. **Academic Integrity:** No features that facilitate cheating or bypass exam security.
2. **Visual Fidelity:** The UI must exactly mimic the official IB e-Assessment software.
3. **Privacy:** No code that tracks user data or requires external databases.

---

## 🐛 How to Report Bugs
If you find a technical glitch (e.g., the Equation Editor crashing or the PDF loader failing), please follow this process:
1. **Check Existing Issues:** Search the GitHub Issues tab to see if the bug is already being tracked.
2. **Open an Issue:** If it’s new, open an issue using the "Bug Report" label.
3. **Details Matter:** Please include your Operating System (Windows 10/11), the specific tool you were using, and a description of the error.

---

## 💡 Feature Requests
We are always looking to add new tools (e.g., specific physics constants or new diagram editors).
* **Process:** Open a GitHub Issue with the tag `enhancement`.
* **Criteria:** You must explain how this feature aligns with the **official IB MYP e-Assessment Blueprints**. 

---

## 💻 Technical Contribution Process
If you are a developer and wish to contribute code changes:

### 1. Development Environment
* **Web Core:** The main logic is in `index.html` using Vanilla JS and CSS.
* **Dependencies:** We use external APIs for Desmos and Polypad. Do not replace these without prior discussion.

### 2. Fork and Branch
* Fork the repository to your own account.
* Create a descriptive branch name (e.g., `fix-timer-logic`).

### 3. Coding Standards
* **CSS:** Use the existing color palette (Deep Blue/White) to match the IB aesthetic.
* **JS:** Use clean, commented code. 
* **Responsibility:** Ensure your changes do not break the **Split-Screen** functionality.

### 4. Submitting a Pull Request (PR)
* Submit your PR against the `main` branch.
* In the description, explain exactly what changed and why.
* **Approval:** All PRs require a manual review and "Merge" by the project lead.

---

## ✉️ Non-Technical Feedback
If you are a student or teacher and do not use GitHub, please send all feedback, feature ideas, or security concerns directly to:
📩 **the.myp.workspace@gmail.com**

---

## ⚖️ Academic Integrity & Ethics
By contributing to this project, you agree that:
* You will not include any copyrighted IB past papers in the code.
* You will not create "cheat" features (e.g., integrated AI solvers).
* You will respect the privacy of students using the tool.

**Thank you for helping us bridge the gap in IB Digital Education!**
