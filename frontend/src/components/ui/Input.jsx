export function Input({ className = '', error, ...props }) {
  return (
    <input
      className={`field-input ${error ? 'error' : ''} ${className}`}
      {...props}
    />
  );
}
