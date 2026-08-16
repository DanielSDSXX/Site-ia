import { AnalysisType } from '@prisma/client';
import { analysisAliasHandler } from '../_analysis-alias';

export const POST = analysisAliasHandler(AnalysisType.CLIENT_EXPLANATION, 'analysis.clientExplanation');
