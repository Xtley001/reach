/**
 * Fix HIGH-05: 'btn-default' variant was mapped to a non-existent CSS class.
 * Now falls back to 'btn-outline' which is defined in global.css.
 */
export function Button({
  variant = 'default',
  size = 'md',
  className = '',
  children,
  ...props
}) {
  const variantClass = {
    default:     'btn-outline',   /* was 'btn-default' which doesn't exist */
    primary:     'btn-primary',
    outline:     'btn-outline',
    ghost:       'btn-ghost',
    destructive: 'btn-danger',
    link:        'btn-ghost',
  }[variant] ?? 'btn-outline';

  const sizeClass = {
    sm:   'btn-sm',
    md:   'btn-md',
    lg:   'btn-lg',
    icon: 'btn-icon',
  }[size] ?? 'btn-md';

  return (
    <button className={`btn ${variantClass} ${sizeClass} ${className}`} {...props}>
      {children}
    </button>
  );
}
