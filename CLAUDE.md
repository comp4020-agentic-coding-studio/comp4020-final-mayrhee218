# Your harness

1. Project Vision
This project is a short-form video-sharing platform where users can express themselves through virtual humans.

Its goal is to make virtual-human content creation as simple and accessible as recording and sharing an ordinary short video.

The core experience is:
1. Choose a built-in 3D avatar or upload a personal avatar.
2. Animate the avatar using facial-expression and body-motion tracking.
3. Choose, upload, or generate a virtual background.
4. Record and publish a short-form video.
5. Watch and interact with other users' videos.
Every implementation decision must support this core experience.

Avoid unnecessary complexity, excessive configuration, and features that do not contribute meaningfully to the project's goals.
2. Non-Negotiable Quality Principles
Accessibility and Simplicity
- Users must not need expensive motion-capture equipment, professional 3D software, or technical knowledge to use the core features.
- Prioritize an intuitive, beginner-friendly interface.
- Provide clear instructions, loading indicators, and meaningful error messages.
- Support keyboard navigation and accessible controls where practical.
- The interface must remain usable on desktop and mobile browsers.
- Advanced features must not prevent beginners from completing a basic video.
Real Functionality Over Visual Demonstrations
- Do not implement fake functionality, misleading buttons, or purely decorative features presented as working capabilities.
- Distinguish clearly between implemented features, prototypes, and planned functionality.
- Do not describe a 2D background image as a true 3D environment.
- Do not claim that an avatar supports facial or body tracking unless the functionality actually works.
- Do not report a feature as completed without verifying its behavior.
User Privacy and Control
- Request camera and microphone permissions only when needed.
- Provide clear feedback when the camera or microphone is active.
- Never upload raw camera footage, facial landmarks, or biometric information to an external service without explicit user consent.
- Where possible, perform facial and body tracking locally in the browser.
- Users must be able to stop recording and cancel an operation.
- Do not claim anonymity if the original camera image remains visible in the recorded output.
- Do not expose private user files, credentials, or API keys.
3. Architecture and Technology Constraints
- Inspect the existing project structure before making changes.
- Preserve the existing Express, JavaScript, and browser-based architecture unless a substantial change is justified.
- Prefer small, modular extensions over unnecessary rewrites.
- Reuse existing recording, uploading, storage, and real-time communication mechanisms where appropriate.
- Use Three.js for browser-based 3D rendering where suitable.
- Prefer VRM for animated humanoid avatars and support compatible GLB assets where practical.
- Use MediaPipe or another justified browser-compatible solution for facial and body tracking.
- Do not introduce major dependencies without explaining their purpose and trade-offs.
- Keep computationally expensive AI workloads outside the resource-constrained application server.
Respect the course deployment constraints:
- One Fly.io application machine with 256 MB RAM.
- One persistent volume mounted at /data.
- Existing Docker, Fly.io, and CI configuration must remain compatible.
- Do not increase resource allocations or introduce additional paid infrastructure without approval.
4. Avatar Requirements
- Users should be able to select from built-in 3D avatars or upload their own compatible 3D models.
- Avatar files must be validated before use.
- A 3D model's appearance alone does not guarantee motion-capture compatibility.
- Only enable facial or skeletal animation when the required expressions, morph targets, or bones are supported.
- Apply smoothing to tracking results to reduce jitter.
- Provide a neutral or idle animation when tracking information is missing.
- Loading failures or unsupported models must not crash the application.
- Keep the avatar's movement synchronized with the recorded video.
- Preserve existing videos and user data when changing the avatar implementation.
5. Virtual Background Requirements
- Support simple built-in backgrounds before introducing computationally expensive AI features.
- Allow users to select or upload compatible virtual backgrounds.
- Distinguish between static images, AI-stylized images, and actual 3D environments.
- Keep the avatar visually integrated with the selected background.
- AI-generated backgrounds should preserve recognizable elements of the original environment when that is the intended feature.
- Never expose external AI service credentials to the browser.
- Provide an understandable fallback when an AI service is unavailable.
- Do not call paid AI services without explicit approval.
6. Multi-User, Real-Time and Persistence Requirements
The application must continue to satisfy the course's three fixed requirements.

Multi-user
- Support at least two independent users interacting with shared application state.
- Keep users' identities and user-owned resources distinguishable.
- Enforce ownership and authorization on the server, not only in the browser.
Real-time
- Shared-state changes relevant to other active users should appear within approximately one second without requiring a page reload.
- Preserve the existing real-time communication behavior.
Persistence
- Published videos, user-created content, and necessary metadata must survive page reloads, application restarts, and redeployments.
- Store persistent files and state using the configured persistent storage.
- Do not rely on temporary container storage for user-created content.
7. Preserve Existing Functionality
Before modifying a feature, identify its dependencies and potential effects on other parts of the application.

Do not break:
- Video recording and playback.
- Video uploads and publishing.
- The shared video feed.
- Existing social interactions and real-time updates.
- Existing user content and metadata.
- The homepage (/).
- The full README page (/readme/).
- Existing automated tests and deployment requirements.
New functionality must be compatible with existing content wherever reasonably possible.
8. Coding and Development Standards
- Prefer readable, maintainable code over unnecessary abstraction.
- Follow existing project conventions.
- Keep modules focused on a single responsibility.
- Avoid duplicating functionality already implemented.
- Validate file uploads and other untrusted inputs.
- Handle errors explicitly and gracefully.
- Do not hard-code secrets or environment-specific credentials.
- Avoid unnecessary dependencies and large assets.
- Consider browser performance, memory consumption, and mobile compatibility.
- Explain significant architectural trade-offs before implementing them.
9. Agent Workflow and Approval Rules
Before implementing a substantial change:
1. Read the relevant existing code, README.md, CLAUDE.md, tests, and deployment constraints.
2. Explain the problem and propose a concise implementation plan.
3. Identify files likely to change and possible risks.
4. Prefer the smallest change that meets the requirement.
5. Implement in incremental, reviewable steps.
6. Run relevant tests and check for regressions.
7. Explain what changed, what was tested, and what remains incomplete.
Do not:
- Delete existing user data without explicit approval.
- Change deployment configuration or resource limits without approval.
- Add paid APIs or services without approval.
- Expose credentials or private information.
- Claim that tests passed unless they were actually executed.
- Silently change project requirements to make implementation easier.
Ask for approval before destructive operations, significant architectural changes, or actions that create additional costs.
10. Testing and Acceptance Criteria
- Run pnpm check after relevant code changes.
- Run pnpm check:evidence when validating submission evidence.
- Preserve the course-provided invariant tests.
- Add automated tests for important functionality and regressions.
- Test the application with two independent browser sessions.
- Verify that relevant shared-state changes appear without refreshing.
- Verify that persistent content survives application restarts.
- Test avatar loading failures, camera permission denial, and unsupported file uploads.
- Test the actual recorded output, not only the live preview.
- Test on desktop and mobile-sized viewports where practical.
- Report test failures honestly and do not modify tests merely to conceal a defect.
The application must continue serving / successfully and render the complete README content at /readme/.
11. Documentation and Development Evidence
- Keep README.md, CLAUDE.md, automated tests, and actual application behavior consistent.
- Record meaningful architectural decisions and their trade-offs.
- Maintain clear, reviewable commit history.
- Document important changes, limitations, and unresolved problems.
- Update the development rules or tests when recurring agent mistakes reveal missing safeguards.
- Do not fabricate test results, process evidence, citations, or completed features.
- Preserve the author's own reasoning and decision-making in the assessed project documentation.
12. Priority Order
When requirements conflict, prioritize:
1. Security, privacy, and preservation of user data.
2. Mandatory course requirements and existing working functionality.
3. The core virtual-human recording and sharing experience.
4. Usability, accessibility, and performance.
5. Maintainability and reliable testing.
6. Advanced AI features and visual enhancements.
The guiding principle: Build a simple, reliable, and genuinely functional virtual-human creation experience rather than an impressive-looking but unreliable prototype.