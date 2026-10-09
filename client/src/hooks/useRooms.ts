import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createRoom as createRoomRequest, fetchRooms } from '../services/rooms';

export const useRooms = () => {
  const queryClient = useQueryClient();

  const roomsQuery = useQuery({
    queryKey: ['rooms'],
    queryFn: fetchRooms,
  });

  const createMutation = useMutation({
    mutationFn: createRoomRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
    },
  });

  return {
    ...roomsQuery,
    createRoom: createMutation.mutateAsync,
    isCreatingRoom: createMutation.isPending,
    createRoomError: createMutation.error,
  };
};
