import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchRooms, createRoom, Room } from '../services/rooms';

export const useRooms = () => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['rooms'],
    queryFn: fetchRooms,
  });

  const mutation = useMutation({
    mutationFn: createRoom,
    onMutate: async (newRoomName: string) => {
      // Cancel any ongoing refetches
      await queryClient.cancelQueries({ queryKey: ['rooms'] });

      // Snapshot previous value
      const previousRooms = queryClient.getQueryData<Room[]>(['rooms']);

      // Optimistically update to the new value
      queryClient.setQueryData<Room[]>(['rooms'], (old: Room[] | undefined) => 
        old ? [...old, { id: 'temp-id', name: newRoomName, ownerId: 'user-123' }] : [{ id: 'temp-id', name: newRoomName, ownerId: 'user-123' }]
      );

      // Return context with previous value
      return { previousRooms };
    },
    onError: (error, newRoomName, context) => {
      // Rollback to the previous value on error
      if (context?.previousRooms) {
        queryClient.setQueryData(['rooms'], context.previousRooms);
      }
      console.error('Error creating room:', error);
    },
    onSuccess: () => {
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
    },
  });

  return { ...query, createRoom: mutation.mutate };
};
