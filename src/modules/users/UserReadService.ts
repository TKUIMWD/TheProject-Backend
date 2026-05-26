import { ComputeResourcePlan } from "../../interfaces/ComputeResourcePlan";
import { CourseInfo } from "../../interfaces/Course/Course";
import { User, UserProfile } from "../../interfaces/User";
import { ComputeResourcePlanModel } from "../../orm/schemas/ComputeResourcePlanSchemas";
import { CourseModel } from "../../orm/schemas/CourseSchemas";
import { UsersModel } from "../../orm/schemas/UserSchemas";
import { DEFAULT_AVATAR } from "../../utils/avatarUpload";
import { createResponse, resp } from "../../utils/resp";
import { validateUserLookupId } from "./UserLookupPolicy";

type UserCourseRepository = {
    listUserCourses(courseIds: string[]): Promise<any[]>;
};

type UserCRPRepository = {
    findById(planId: string): Promise<any | null>;
};

type UserLookupRepository = {
    findById(userId: string): Promise<any | null>;
};

type UserReadServiceDeps = {
    courses?: UserCourseRepository;
    crps?: UserCRPRepository;
    users?: UserLookupRepository;
    defaultAvatar?: string;
};

const defaultCourseRepository: UserCourseRepository = {
    listUserCourses: (courseIds) => CourseModel.find({
        _id: { $in: courseIds }
    })
        .populate<{ submitter_user_id: { username: string } }>("submitter_user_id", "username")
        .lean()
        .exec()
};

const defaultCRPRepository: UserCRPRepository = {
    findById: (planId) => ComputeResourcePlanModel.findOne({ _id: planId }).lean().exec()
};

const defaultUserLookupRepository: UserLookupRepository = {
    findById: (userId) => UsersModel.findById(userId).lean().exec()
};

export class UserReadService {
    private readonly courses: UserCourseRepository;
    private readonly crps: UserCRPRepository;
    private readonly users: UserLookupRepository;
    private readonly defaultAvatar: string;

    constructor(deps: UserReadServiceDeps = {}) {
        this.courses = deps.courses ?? defaultCourseRepository;
        this.crps = deps.crps ?? defaultCRPRepository;
        this.users = deps.users ?? defaultUserLookupRepository;
        this.defaultAvatar = deps.defaultAvatar ?? DEFAULT_AVATAR;
    }

    public async getUserCourses(user: User): Promise<resp<CourseInfo[] | undefined>> {
        if (!user.isVerified) {
            return createResponse(403, "user is not verified");
        }

        const courses = await this.courses.listUserCourses(user.course_ids);
        const courseInfo = courses.map((course): CourseInfo => ({
            _id: course._id,
            course_name: course.course_name,
            course_subtitle: course.course_subtitle,
            duration_in_minutes: course.duration_in_minutes,
            difficulty: course.difficulty,
            rating: course.rating,
            teacher_name: course.submitter_user_id?.username,
            update_date: course.update_date,
            status: course.status
        }));

        if (courseInfo.length === 0) {
            return createResponse(200, "User has no courses", []);
        }

        return createResponse(200, "User courses retrieved successfully", courseInfo);
    }

    public async getUserCRP(user: User): Promise<resp<ComputeResourcePlan | undefined>> {
        if (!user.isVerified) {
            return createResponse(403, "user is not verified");
        }

        const crp = await this.crps.findById(user.compute_resource_plan_id);
        if (!crp) {
            return createResponse(404, "User CRP not found");
        }

        return createResponse(200, "User CRP retrieved successfully", crp);
    }

    public async getUserById(input: {
        actor: User;
        targetUserId: unknown;
    }): Promise<resp<UserProfile | undefined>> {
        if (!input.actor.isVerified) {
            return createResponse(403, "user is not verified");
        }

        const userIdResult = validateUserLookupId(input.targetUserId);
        if (!userIdResult.valid) {
            return createResponse(400, userIdResult.message);
        }

        const targetUser = await this.users.findById(userIdResult.userId);
        if (!targetUser) {
            return createResponse(404, "User not found");
        }

        return createResponse(200, "User retrieved successfully", {
            username: targetUser.username,
            email: targetUser.email,
            avatar_path: targetUser.avatar_path || this.defaultAvatar
        });
    }
}

export const userReadService = new UserReadService();
