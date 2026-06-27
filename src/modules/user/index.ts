/**
 * 用户模块导出
 */

export { default as router } from './router';
export * from './constants';
export * from './types';
export { register, login, changePassword, updatePassword, getUserById, updateUserStatus, deleteUser } from './service';
export { register as registerController, login as loginController, changePassword as changePasswordController, updateUserStatus as updateUserStatusController, deleteUser as deleteUserController } from './controller';
