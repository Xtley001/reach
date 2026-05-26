export function Button({
  variant = 'default',
  size = 'md',
  className = '',
  children,
  ...props
}) {
  const variantClass = {
    default:     'btn-default',
    primary:     'btn-primary',
    outline:     'btn-outline',
    ghost:       'btn-ghost',
    destructive: 'btn-danger',
    link:        'btn-ghost',
  }[variant] || 'btn-default';

  const sizeClass = {
    sm:   'btn-sm',
    md:   'btn-md',
    lg:   'btn-lg',
    icon: 'btn-icon',
  }[size] || 'btn-md';

  return (
    <button className={`btn ${variantClass} ${sizeClass} ${className}`} {...props}>
      {children}
    </button>
  );
}
