import { User } from "../../interfaces/User";
import { logger } from "../../middlewares/log";
import { sendCourseInvitationsEmail } from "../../utils/MailSender/CourseInviteSender";
import { createResponse, resp } from "../../utils/resp";
import { buildJoinedCourseIds, validateCourseJoinAccess } from "./CourseAccessPolicy";
import { validateCourseInviteRequest, selectCourseInviteRecipientEmails } from "./CourseInvitePolicy";
import { courseRepository } from "./CourseRepository";
import { userRepository } from "../users/UserRepository";

type CourseLookupRepository = {
    findById(courseId: string, options?: { lean?: boolean }): Promise<any | null>;
};

type CourseUserRepository = {
    updateCourseIds(userId: string, courseIds: string[]): Promise<any | null>;
    listByEmails(emails: string[], options?: { lean?: boolean }): Promise<any[]>;
};

type CourseInvitationSender = (email: string, courseName: string, courseId: string, inviter: string) => void | Promise<void>;

type CourseMembershipServiceDeps = {
    courseRepo?: CourseLookupRepository;
    userRepo?: CourseUserRepository;
    invitationSender?: CourseInvitationSender;
};

export class CourseMembershipService {
    private readonly courseRepo: CourseLookupRepository;
    private readonly userRepo: CourseUserRepository;
    private readonly invitationSender: CourseInvitationSender;

    constructor(deps: CourseMembershipServiceDeps = {}) {
        this.courseRepo = deps.courseRepo ?? courseRepository;
        this.userRepo = deps.userRepo ?? userRepository;
        this.invitationSender = deps.invitationSender ?? sendCourseInvitationsEmail;
    }

    public async joinCourse(input: {
        user: User;
        courseId: string;
    }): Promise<resp<String | undefined>> {
        const userId = input.user._id?.toString();
        if (!userId) {
            return createResponse(401, "Invalid user");
        }

        const course = await this.courseRepo.findById(input.courseId);
        if (!course) {
            return createResponse(404, "Course not found");
        }

        const joinAccess = validateCourseJoinAccess({
            courseId: input.courseId,
            courseStatus: course.status,
            joinedCourseIds: input.user.course_ids
        });
        if (!joinAccess.valid) {
            return createResponse(joinAccess.statusCode, joinAccess.message);
        }

        const nextCourseIds = buildJoinedCourseIds(input.user.course_ids, input.courseId);
        await this.userRepo.updateCourseIds(userId, nextCourseIds);

        logger.info(`User ${userId} joined course ${input.courseId}`);
        return createResponse(200, "Successfully joined the course");
    }

    public async inviteUsers(input: {
        actor: User;
        request: { course_id?: unknown; emails?: unknown };
    }): Promise<resp<String | undefined>> {
        const inviteRequest = validateCourseInviteRequest(input.request);
        if (!inviteRequest.valid) {
            return createResponse(400, inviteRequest.message);
        }
        const actorUserId = input.actor._id?.toString();
        if (!actorUserId) {
            return createResponse(401, "Invalid user");
        }

        const course = await this.courseRepo.findById(inviteRequest.courseId, { lean: true });
        if (!course) {
            return createResponse(404, "Course not found");
        }

        if (course.submitter_user_id !== actorUserId) {
            return createResponse(403, "You are not authorized to invite users to this course");
        }

        const invitedUsers = await this.userRepo.listByEmails(inviteRequest.emails, { lean: true });
        const recipientEmails = selectCourseInviteRecipientEmails(
            inviteRequest.emails,
            invitedUsers,
            inviteRequest.courseId
        );
        for (const email of recipientEmails) {
            await this.invitationSender(email, course.course_name, inviteRequest.courseId, input.actor.username);
        }

        return createResponse(200, "Invitations sent");
    }
}

export const courseMembershipService = new CourseMembershipService();
