import { ReactNode } from "react";

type AdminPageHeaderProps = {
  title: string;
  description: string;
  eyebrow?: string;
  actions?: ReactNode;
};

export default function AdminPageHeader({
  title,
  description,
  eyebrow = "Operations Console",
  actions,
}: AdminPageHeaderProps) {
  return (
    <header className="page-header panel">
      <div className="page-header-copy">
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="panel-title">{title}</h2>
        <p className="panel-subtitle">{description}</p>
      </div>
      {actions ? <div className="page-header-actions">{actions}</div> : null}
    </header>
  );
}
