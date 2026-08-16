import { AnalysisType } from '@prisma/client';
import { analysisAliasHandler } from '../_analysis-alias';

export const POST = analysisAliasHandler(AnalysisType.NEXT_ACTIONS, 'analysis.nextActions');
