'use client'
import React, { useEffect, useState } from 'react';
import { Box, Flex, Text, Button, Image, useColorMode, useToast } from '@chakra-ui/react';
import { getCommunityInfo, getProfile } from '@/lib/hive/client-functions';
import { useAioha } from '@aioha/react-ui';
import { useLoginModal } from '@/contexts/LoginModalContext';
import { getHiveAvatarUrl } from '@/lib/utils/avatarUtils';

export default function Header() {
    const { colorMode } = useColorMode();
    const [profileInfo, setProfileInfo] = useState<any>();
    const [communityInfo, setCommunityInfo] = useState<any>();
    const { user, aioha } = useAioha();
    const { openLoginModal } = useLoginModal();
    const isLoggedIn = !!user;
    const toast = useToast();

    const communityTag = process.env.NEXT_PUBLIC_HIVE_COMMUNITY_TAG;

    useEffect(() => {
        const fetchData = async () => {
            try {
                const cachedProfileData = sessionStorage.getItem('profileData');
                if (cachedProfileData) {
                    setProfileInfo(JSON.parse(cachedProfileData));
                } else if (communityTag) {
                    const profileData = await getProfile(communityTag);
                    sessionStorage.setItem('profileData', JSON.stringify(profileData));
                    setProfileInfo(profileData);
                }

                const cachedCommunityData = sessionStorage.getItem('communityData');
                if (cachedCommunityData) {
                    setCommunityInfo(JSON.parse(cachedCommunityData));
                } else if (communityTag) {
                    const communityData = await getCommunityInfo(communityTag);
                    sessionStorage.setItem('communityData', JSON.stringify(communityData));
                    setCommunityInfo(communityData);
                }
            } catch (error) {
                console.error('Failed to fetch data', error);
            }
        };

        if (communityTag) {
            fetchData();
        }
    }, [communityTag]);

    return (
        <Box bg="secondary" px={{ base: 4, md: 6 }} py={2}>
            <Flex justify="space-between" align="center">
                <Flex align="center" gap={2}>
                    {/* Display profile image */}
                    {communityTag && (
                        <Image
                            src={getHiveAvatarUrl(communityTag, 'large')}
                            alt="Profile Image"
                            boxSize="80px" // Adjust the size as needed
                            borderRadius="full"
                            mr={2} // Reduced margin to bring elements closer
                        />
                    )}
                    <Flex direction="column">
                        <Text fontSize={{ base: '2xl', md: '3xl' }} fontWeight="bold">
                            {communityInfo?.title}
                        </Text>
                        {/* Display description with limited width */}
                        {communityInfo?.about && (
                            <Text
                                fontSize="xs"
                                color="primary"
                                fontWeight="bold"
                                maxW="400px" // Limit the width of the description
                                whiteSpace="normal" // Allow line breaks
                                wordBreak="break-word" // Ensure long words break properly
                            >
                                {communityInfo.about}
                            </Text>
                        )}
                    </Flex>
                </Flex>
                {isLoggedIn ? (
                    <Button onClick={() => aioha.logout()}>
                        Logout ({user})
                    </Button>
                ) : (
                    <Button onClick={openLoginModal}>
                        Login
                    </Button>
                )}
            </Flex>
        </Box>
    );
}
