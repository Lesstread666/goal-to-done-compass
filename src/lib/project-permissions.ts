/** Display permission only; database policies enforce every project write. */
export function canManageProject(project: { user_id: string }, userId: string | null | undefined): boolean {
  return !!userId && project.user_id === userId;
}