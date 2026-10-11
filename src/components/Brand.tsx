/** Shared transparent vector mark and live wordmark, crisp at any pixel density. */
export default function Brand() {
  return <span className="prep-brand-lockup" aria-label="PrepSuite.ai">
    <img src="/prepsuite-shield.svg" width="36" height="36" alt="" aria-hidden="true"/>
    <span className="prep-brand-name">PrepSuite<span className="prep-brand-domain">.ai</span></span>
  </span>;
}
