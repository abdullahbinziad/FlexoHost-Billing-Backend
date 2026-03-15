import mongoose, { Schema, Document } from 'mongoose';

export interface ITerminationWarningLog extends Document {
    serviceId: mongoose.Types.ObjectId;
    /** e.g. TERMINATION_WARN_7, TERMINATION_WARN_3, TERMINATION_WARN_1 */
    reminderType: string;
    sentAt: Date;
}

const terminationWarningLogSchema = new Schema<ITerminationWarningLog>(
    {
        serviceId: { type: Schema.Types.ObjectId, ref: 'Service', required: true },
        reminderType: { type: String, required: true },
        sentAt: { type: Date, default: Date.now }
    },
    { timestamps: true }
);

terminationWarningLogSchema.index({ serviceId: 1, reminderType: 1 }, { unique: true });

export default mongoose.model<ITerminationWarningLog>('TerminationWarningLog', terminationWarningLogSchema);
