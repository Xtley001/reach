export function Card({ className = '', children, ...props }) {
  return <div className={`card ${className}`} {...props}>{children}</div>;
}
export function CardHeader({ className = '', children, ...props }) {
  return <div className={`card-header ${className}`} {...props}>{children}</div>;
}
export function CardTitle({ className = '', children, ...props }) {
  return <div className={`card-title ${className}`} {...props}>{children}</div>;
}
export function CardDesc({ className = '', children, ...props }) {
  return <div className={`card-desc ${className}`} {...props}>{children}</div>;
}
