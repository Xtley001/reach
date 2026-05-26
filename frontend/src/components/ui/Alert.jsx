export function Alert({ variant = 'error', className = '', children, ...props }) {
  const cls = { error: 'alert-error', success: 'alert-success', warning: 'alert-warning' }[variant] || 'alert-error';
  return (
    <div className={`alert ${cls} ${className}`} {...props}>
      {children}
    </div>
  );
}
