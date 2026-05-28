export function Label({ children, required, className = '', ...props }) {
  return (
    <label className={`field-label ${className}`} {...props}>
      {children}
      {required && <span className="req">*</span>}
    </label>
  );
}
