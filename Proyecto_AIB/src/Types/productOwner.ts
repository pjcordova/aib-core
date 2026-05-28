export interface AIBQuestion {
  id: string;
  type: 'text' | 'multiple_choice';
  text: string;
  options?: string[]; // Only if type is 'multiple_choice'
}

export interface ProductOwnerResponse {
  is_complete: boolean;
  rationale: string;
  questions?: AIBQuestion[];
}

export interface QAHistory {
  question_id: string;
  question: string;
  answer: string;
}
