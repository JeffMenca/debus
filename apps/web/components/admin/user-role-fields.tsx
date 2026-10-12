'use client';

import { type UserRole, isBranchRole } from '@debus/contracts';
import { Field } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { type BranchOption, branchLabel, branchesFor } from '@/lib/admin/branch-options';
import { ROLE_LABELS, STAFF_ROLES } from '@/lib/roles';

interface UserRoleFieldsProps {
  idPrefix: string;
  role: UserRole | undefined;
  branchId: string | undefined;
  // Every branch; the ones this role may be placed in are picked here.
  branches: BranchOption[];
  // Without it the role is fixed and only the branch can change (editing).
  onRoleChange?: (role: UserRole) => void;
  onBranchChange: (branchId: string) => void;
  roleError?: string;
  branchError?: string;
}

// The role and branch selects both dialogs share; the branch only exists for branch roles.
export function UserRoleFields({
  idPrefix,
  role,
  branchId,
  branches,
  onRoleChange,
  onBranchChange,
  roleError,
  branchError,
}: UserRoleFieldsProps) {
  return (
    <>
      {onRoleChange && (
        <Field id={`${idPrefix}-role`} label="Rol" error={roleError}>
          <Select value={role ?? ''} onValueChange={(value) => onRoleChange(value as UserRole)}>
            <SelectTrigger id={`${idPrefix}-role`} aria-invalid={roleError ? true : undefined}>
              <SelectValue placeholder="Elige un rol" />
            </SelectTrigger>
            <SelectContent>
              {STAFF_ROLES.map((staffRole) => (
                <SelectItem key={staffRole} value={staffRole}>
                  {ROLE_LABELS[staffRole]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
      {role && isBranchRole(role) && (
        <Field id={`${idPrefix}-branch`} label="Sucursal" error={branchError}>
          <Select value={branchId ?? ''} onValueChange={onBranchChange}>
            <SelectTrigger id={`${idPrefix}-branch`} aria-invalid={branchError ? true : undefined}>
              <SelectValue placeholder="Elige una sucursal" />
            </SelectTrigger>
            <SelectContent>
              {branchesFor(role, branches).map((branch) => (
                <SelectItem key={branch.id} value={branch.id}>
                  {branchLabel(branch)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
    </>
  );
}
